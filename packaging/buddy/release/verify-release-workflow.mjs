import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { classifyCiScope } from '../../../infrastructure/scripts/resolve-ci-scope.mjs'
import {
  lexoraReleaseTransitionPaths,
  validateLexoraReleaseSources,
  validateLexoraReleaseTransition,
} from '../../release/transition.mjs'
import { createLexoraVersionSources } from '../../release/version.mjs'
import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const workflowPaths = {
  build: '.github/workflows/buddy-build.yml',
  ci: '.github/workflows/ci.yml',
  prepare: '.github/workflows/prepare-release.yml',
  release: '.github/workflows/release.yml',
}
const githubExpression = value => `\${{ ${value} }}`

export function verifyBuddyReleaseWorkflow(cwd = repoRoot) {
  const workflows = Object.fromEntries(
    Object.entries(workflowPaths).map(([name, path]) => [name, readWorkflow(cwd, path)]),
  )
  const errors = []

  verifyCiWorkflow(workflows.ci, errors)
  verifyCiScopeClassification(errors)
  verifyReleaseTransitionContract(errors)
  verifyBuildWorkflow(workflows.build, errors)
  verifyPrepareWorkflow(workflows.prepare, errors)
  verifyReleaseWorkflow(workflows.release, errors)
  verifyPinnedActions(Object.values(workflows).join('\n'), errors)

  return errors
}

function verifyCiWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Lexora CI',
    'pull_request:',
    'ready_for_review',
    'contents: read',
    'cancel-in-progress: true',
  ], errors, 'Lexora CI must run read-only for every pull request')
  if (!/^permissions:\n {2}contents: read$/m.test(workflow))
    errors.push('Lexora CI must only read repository contents')
  forbidFragments(workflow, [
    'push:',
    'workflow_dispatch:',
    'tags:',
    'paths:',
    'actions: read',
    'actions: write',
    'contents: write',
    'pull-requests: read',
    'pull-requests: write',
  ], errors, 'Lexora CI must cover every pull request without a publication path')

  const scope = readJob(workflow, 'scope')
  requireFragments(scope, [
    'fetch-depth: 0',
    `BASE_SHA: ${githubExpression('github.event.pull_request.base.sha')}`,
    `HEAD_SHA: ${githubExpression('github.event.pull_request.head.sha')}`,
    'node infrastructure/scripts/resolve-ci-scope.mjs',
    '--github-output "$GITHUB_OUTPUT"',
  ], errors, 'Lexora CI must resolve cumulative pull request scope without package installation')
  forbidFragments(scope, [
    'resolve-ci-reuse.mjs',
    'pnpm/action-setup@',
    'github.event.before',
    '--mode',
  ], errors, 'Lexora CI scope resolution must remain a local read-only classifier')

  requireFragments(
    readFileSync(resolve(repoRoot, 'infrastructure/scripts/resolve-ci-scope.mjs'), 'utf8'),
    ['--no-renames'],
    errors,
    'Lexora CI scope resolution must classify both sides of renamed paths',
  )

  const website = readJob(workflow, 'website-quality')
  requireFragments(website, [
    'needs: scope',
    'needs.scope.outputs.website == \'true\'',
    'pnpm --filter @haohaoxue/lexora --filter @haohaoxue/lexora-website install --frozen-lockfile',
    'node packaging/website/release/verify-pages-workflow.mjs',
    'pnpm --filter @haohaoxue/lexora-website lint',
    'pnpm --filter @haohaoxue/lexora-website build',
  ], errors, 'Lexora CI must lint and build Website only when website changes')

  const quality = readJob(workflow, 'quality')
  requireFragments(quality, [
    'needs: scope',
    'needs.scope.outputs.quality == \'true\'',
    'timeout-minutes: 30',
    'pnpm install --frozen-lockfile',
    'run: pnpm lint',
    'run: pnpm type-check',
    'run: pnpm test',
    'pnpm --filter \'!@lexora/buddy\' --filter \'!@haohaoxue/lexora-website\' --recursive --if-present build',
  ], errors, 'Lexora CI quality job must lint, type-check, test and build the workspace')

  const contracts = readJob(workflow, 'release-contracts')
  requireFragments(contracts, [
    'needs: scope',
    'needs.scope.outputs.contracts == \'true\'',
    'node packaging/release/version.mjs --check',
    'node packaging/release/status.mjs',
    'node packaging/buddy/release/verify-release-workflow.mjs',
    'node packaging/website/release/verify-pages-workflow.mjs',
  ], errors, 'Lexora CI must execute each allowlisted release entrypoint without building Buddy packages')

  const packages = readJob(workflow, 'buddy-packages')
  requireFragments(packages, [
    'needs: scope',
    'needs.scope.outputs.buddy == \'true\'',
    'github.event.pull_request.draft == false',
    'uses: ./.github/workflows/buddy-build.yml',
    'upload-artifacts: false',
  ], errors, 'Lexora CI must run affected Buddy package verification in parallel with quality without uploading artifacts')

  const gate = readJob(workflow, 'ci-gate')
  requireFragments(gate, [
    'needs: [scope, website-quality, quality, release-contracts, buddy-packages]',
    'if: always()',
    'needs.scope.result',
    'needs.quality.result',
    'needs.buddy-packages.result',
    'needs.release-contracts.result',
    'needs.website-quality.result',
  ], errors, 'Lexora CI must expose one stable gate for all selected pull request checks')
  forbidFragments(gate, [
    'REUSED:',
    'SOURCE_RUN_URL:',
    'resolve-ci-reuse.mjs',
    'actions/upload-artifact@',
  ], errors, 'Lexora CI gate must not maintain a second proof protocol')
}

function verifyCiScopeClassification(errors) {
  const cases = [
    [['apps/website/src/index.md'], { buddy: false, contracts: false, website: true, quality: false }],
    [['apps/docs/src/index.md'], { buddy: false, contracts: false, website: true, quality: false }],
    [['.github/workflows/website-pages.yml'], { buddy: false, contracts: false, website: true, quality: false }],
    [['packaging/website/release/verify-pages-workflow.mjs'], { buddy: false, contracts: false, website: true, quality: false }],
    [['README.md'], { buddy: false, contracts: false, website: false, quality: false }],
    [['apps/web/src/main.ts'], { buddy: false, contracts: false, website: false, quality: true }],
    [['.github/workflows/ci.yml'], { buddy: false, contracts: true, website: false, quality: false }],
    [['.github/workflows/prepare-release.yml'], { buddy: false, contracts: true, website: false, quality: false }],
    [['packaging/release/status.mjs'], { buddy: false, contracts: true, website: false, quality: false }],
    [['packaging/release/transition.mjs'], { buddy: false, contracts: true, website: false, quality: false }],
    [['.github/workflows/buddy-build.yml'], { buddy: true, contracts: true, website: false, quality: true }],
    [['package.json'], { buddy: true, contracts: true, website: false, quality: true }],
    [['pnpm-lock.yaml'], { buddy: true, contracts: false, website: false, quality: true }],
    [['.github/workflows/future.yml'], { buddy: true, contracts: true, website: false, quality: true }],
    [['packaging/release/future.mjs'], { buddy: true, contracts: true, website: false, quality: true }],
    [[
      '.github/workflows/ci.yml',
      'README.md',
      'apps/docs/package.json',
      'package.json',
      'pnpm-lock.yaml',
    ], { buddy: true, contracts: true, website: true, quality: true }],
    [['apps/buddy/electron/main/index.ts'], { buddy: true, contracts: false, website: false, quality: true }],
    [['pnpm-workspace.yaml'], { buddy: true, contracts: false, website: false, quality: true }],
    [['future/product/input.txt'], { buddy: true, contracts: false, website: false, quality: true }],
    [[], { buddy: true, contracts: true, website: false, quality: true }],
  ]

  if (cases.some(([files, expected]) => (
    JSON.stringify(classifyCiScope(files)) !== JSON.stringify(expected)
  ))) {
    errors.push('Lexora CI scope classification must isolate Website and release contracts while keeping Buddy dependency changes conservative')
  }
}

function verifyBuildWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Buddy Package Verification',
    'workflow_call:',
    'upload-artifacts:',
    'type: boolean',
    'default: false',
    'contents: read',
  ], errors, 'Buddy package verification must be a reusable read-only workflow')
  requireGlobalReadOnly(workflow, errors, 'Buddy package verification')
  forbidFragments(workflow, [
    'pull_request:',
    'workflow_dispatch:',
    'contents: write',
  ], errors, 'Buddy package verification must only run through a caller and remain read-only')

  verifySourceJob(readJob(workflow, 'verify-source'), errors)
  verifyUbuntuJob(readJob(workflow, 'build-ubuntu'), errors)
  verifyArchJob(readJob(workflow, 'build-arch'), errors)
  forbidFragments(workflow, [
    'needs:',
  ], errors, 'Buddy source and platform package jobs must start independently')
}

function verifyReleaseTransitionContract(errors) {
  requireFragments(
    readFileSync(resolve(repoRoot, 'packaging/release/transition.mjs'), 'utf8'),
    ['--summary'],
    errors,
    'Lexora release transition must reject file structure and mode changes',
  )

  const before = createVersionState('0.1.1', 1_700_000_000)
  const after = createVersionState('0.1.2', 1_700_000_001)
  const beforeSources = createVersionSources('0.1.1', 1_700_000_000)
  const monotonicEpoch = createLexoraVersionSources(
    beforeSources,
    '0.1.2',
    { now: () => 1 },
  ).sourceDateEpoch
  const afterSources = createLexoraVersionSources(
    beforeSources,
    '0.1.2',
    { sourceDateEpoch: 1_700_000_001 },
  ).sources
  const validSourceErrors = validateLexoraReleaseSources({
    after,
    afterSources,
    beforeSources,
  })
  const tamperedSources = {
    ...afterSources,
    'apps/buddy/package.json': afterSources['apps/buddy/package.json'].replace(
      '"private": true',
      '"private": true,\n  "description": "unexpected"',
    ),
  }
  const tamperedSourceErrors = validateLexoraReleaseSources({
    after,
    afterSources: tamperedSources,
    beforeSources,
  })
  const validErrors = validateLexoraReleaseTransition({
    after,
    before,
    changedPaths: lexoraReleaseTransitionPaths,
  })
  const unchangedVersionErrors = validateLexoraReleaseTransition({
    after: createVersionState('0.1.1', 1_700_000_001),
    before,
    changedPaths: lexoraReleaseTransitionPaths,
  })
  const staleEpochErrors = validateLexoraReleaseTransition({
    after: createVersionState('0.1.2', 1_700_000_000),
    before,
    changedPaths: lexoraReleaseTransitionPaths,
  })
  const missingPathErrors = validateLexoraReleaseTransition({
    after,
    before,
    changedPaths: lexoraReleaseTransitionPaths.slice(1),
  })
  const extraPathErrors = validateLexoraReleaseTransition({
    after,
    before,
    changedPaths: [...lexoraReleaseTransitionPaths, 'apps/buddy/electron/main/index.ts'],
  })

  if (
    validErrors.length
    || monotonicEpoch !== 1_700_000_001
    || validSourceErrors.length
    || !tamperedSourceErrors.some(error => error.includes('non-generated changes'))
    || !unchangedVersionErrors.some(error => error.includes('product version must increase'))
    || !staleEpochErrors.some(error => error.includes('sourceDateEpoch must increase'))
    || !missingPathErrors.some(error => error.includes('missing version files'))
    || !extraPathErrors.some(error => error.includes('non-version files'))
  ) {
    errors.push('Lexora release transition must require one increasing, version-only product-family commit')
  }
}

function createVersionSources(version, sourceDateEpoch) {
  const applicationPaths = [
    'package.json',
    'apps/agent/package.json',
    'apps/api/package.json',
    'apps/buddy/package.json',
    'apps/web/package.json',
  ]
  return {
    ...Object.fromEntries(applicationPaths.map(path => [
      path,
      `${JSON.stringify({ name: path, version, private: true }, null, 2)}\n`,
    ])),
    'apps/website/package.json': `${JSON.stringify({ name: 'website', private: true }, null, 2)}\n`,
    'packages/contracts/package.json': `${JSON.stringify({ name: 'contracts', private: true }, null, 2)}\n`,
    'packages/shared/package.json': `${JSON.stringify({ name: 'shared', private: true }, null, 2)}\n`,
    'apps/buddy/buddy.version.json': `${JSON.stringify({ version, sourceDateEpoch }, null, 2)}\n`,
    'apps/buddy/native-pet/Cargo.toml': `[package]\nname = "lexora-buddy-pet"\nversion = "${version}"\n`,
    'apps/buddy/native-pet/Cargo.lock': `version = 4\n\n[[package]]\nname = "lexora-buddy-pet"\nversion = "${version}"\n`,
  }
}

function createVersionState(version, sourceDateEpoch) {
  return {
    applicationVersions: {
      agent: version,
      api: version,
      buddy: version,
      web: version,
    },
    buddyMetadataVersion: version,
    cargoLockVersion: version,
    cargoVersion: version,
    packagePrivacy: {
      'package.json': true,
      'apps/agent/package.json': true,
      'apps/api/package.json': true,
      'apps/buddy/package.json': true,
      'apps/web/package.json': true,
      'apps/website/package.json': true,
      'packages/contracts/package.json': true,
      'packages/shared/package.json': true,
    },
    productVersion: version,
    sourceDateEpoch,
    versionlessPackageVersions: {
      'apps/website/package.json': undefined,
      'packages/contracts/package.json': undefined,
      'packages/shared/package.json': undefined,
    },
  }
}

function verifyPrepareWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Prepare Lexora Release',
    'workflow_dispatch:',
    'version:',
    'required: true',
    'type: string',
    'contents: read',
    'group: lexora-prepare-release',
    'cancel-in-progress: false',
  ], errors, 'Release preparation must be a manual, serialized, read-only workflow by default')
  requireGlobalReadOnly(workflow, errors, 'Release preparation')
  forbidFragments(workflow, [
    'pull_request:',
    'push:',
    'secrets.',
    '--force',
    'gh release create',
    'refs/tags/$RELEASE_TAG',
  ], errors, 'Release preparation must not expose automatic triggers, broad workflow permissions, secrets or force updates')
  if ((workflow.match(/contents: write/g) ?? []).length !== 1)
    errors.push('Only the release preparation job may have contents write permission')
  if ((workflow.match(/pull-requests: write/g) ?? []).length !== 1)
    errors.push('Only the release preparation job may have pull request write permission')

  const prepare = readJob(workflow, 'prepare-release')
  requireFragments(prepare, [
    'if: github.ref_name == \'master\'',
    'contents: write',
    'pull-requests: write',
    'ref: master',
    'fetch-depth: 0',
    'persist-credentials: false',
    `VERSION: ${githubExpression('inputs.version')}`,
    'node packaging/release/version.mjs --check-next "$VERSION"',
    'node packaging/release/version.mjs --set "$VERSION"',
    'node packaging/release/version.mjs --check',
    'startswith("chore/release-v")',
    'repos/$GITHUB_REPOSITORY/git/ref/heads/$release_branch',
    'repos/$GITHUB_REPOSITORY/git/ref/tags/$release_tag',
    'repos/$GITHUB_REPOSITORY/releases/tags/$release_tag',
    'HTTP 404',
    'node packaging/release/transition.mjs --check "$BASE_SHA" "$HEAD_SHA"',
    'GIT_CONFIG_KEY_0=http.https://github.com/.extraheader',
    'git push origin "HEAD:refs/heads/$RELEASE_BRANCH"',
    'gh pr create',
    'gh pr list',
    'gh api --method DELETE',
    'git/refs/heads/$RELEASE_BRANCH',
    '--base master',
    '--head "$RELEASE_BRANCH"',
  ], errors, 'Release preparation must create one validated version-only pull request from master')
}

function verifyReleaseWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Lexora Release',
    'push:',
    'branches:',
    '- master',
    'paths:',
    '- apps/buddy/buddy.version.json',
    'contents: read',
    'cancel-in-progress: false',
  ], errors, 'Lexora Release must run automatically and read-only by default after a version transition reaches master')
  requireGlobalReadOnly(workflow, errors, 'Lexora Release')
  forbidFragments(workflow, [
    'pull_request:',
    'tags:',
    'workflow_dispatch:',
    'publish_release:',
    '--clobber',
  ], errors, 'Lexora Release must not expose tag, manual or overwrite publication paths')
  if ((workflow.match(/contents: write/g) ?? []).length !== 1)
    errors.push('Only the release publication job may have contents write permission')

  verifyReleaseValidationJob(readJob(workflow, 'validate-release'), errors)

  const packages = readJob(workflow, 'buddy-packages')
  requireFragments(packages, [
    'needs: validate-release',
    'uses: ./.github/workflows/buddy-build.yml',
    'upload-artifacts: true',
  ], errors, 'Lexora Release must build packages only after version transition validation')

  verifyPublishJob(readJob(workflow, 'publish-release'), errors)
  verifyPublicAssetsJob(readJob(workflow, 'verify-public-assets'), errors)
}

function verifyReleaseValidationJob(job, errors) {
  requireFragments(job, [
    'timeout-minutes: 10',
    'fetch-depth: 0',
    `BEFORE_SHA: ${githubExpression('github.event.before')}`,
    `AFTER_SHA: ${githubExpression('github.sha')}`,
    `commit: ${githubExpression('steps.transition.outputs.commit')}`,
    `tag: ${githubExpression('steps.transition.outputs.tag')}`,
    `version: ${githubExpression('steps.transition.outputs.version')}`,
    'node packaging/release/transition.mjs',
    '--check "$BEFORE_SHA" "$AFTER_SHA"',
    '--github-output "$GITHUB_OUTPUT"',
    'repos/$GITHUB_REPOSITORY/git/ref/tags/$TAG',
    'repos/$GITHUB_REPOSITORY/releases/tags/$TAG',
    'HTTP 404',
  ], errors, 'Release validation must bind a strict version-only master transition and reject an existing tag or Release')
}

function verifySourceJob(job, errors) {
  requireFragments(job, [
    'timeout-minutes: 30',
    'components: clippy, rustfmt',
    'pnpm install --frozen-lockfile',
    'pnpm check:buddy:source',
  ], errors, 'Buddy source gate must run independently with the required Node and Rust checks')
  forbidFragments(job, [
    'package:deb',
    'package:arch',
    'package-desktop.mjs',
    'actions/upload-artifact@',
  ], errors, 'Buddy source gate must not build or upload platform packages')
  forbidReleaseMutation(job, errors, 'Buddy source gate')
}

function verifyUbuntuJob(job, errors) {
  const install = 'sudo apt-get install -y ./apps/buddy/.output/artifacts/desktop/Lexora-Buddy-*-linux-amd64.deb'
  const smoke = 'xvfb-run -a node packaging/buddy/ci/run-gui-smoke.mjs'

  requireFragments(job, [
    'timeout-minutes: 60',
    'pnpm --filter @lexora/buddy package:deb',
  ], errors, 'Ubuntu build job must build the canonical deb package with a bounded timeout')
  if (/run:\s*pnpm check:buddy\s*$/m.test(job))
    errors.push('Ubuntu build job must not repeat the Buddy source gate')
  requireOrder(job, install, smoke, errors, 'Ubuntu build job must install the built Desktop deb before GUI smoke')
  requireFragments(job, [
    'LEXORA_DESKTOP_EXECUTABLE_PATH: /opt/lexora-buddy/lexora-buddy',
    'LEXORA_BUDDY_PET_PATH: /opt/lexora-buddy/resources/native-pet/lexora-buddy-pet',
    'timeout-minutes: 2',
  ], errors, 'Ubuntu build job must run GUI smoke against the installed Desktop and native pet')
  requireFragments(job, [
    'name: lexora-buddy-ubuntu',
    'apps/buddy/.output/artifacts/desktop/*.deb',
    'include-hidden-files: true',
    'compression-level: 0',
    'retention-days: 7',
    'if: inputs.upload-artifacts',
  ], errors, 'Ubuntu build job must upload the verified deb artifact with bounded retention')
  forbidReleaseMutation(job, errors, 'Ubuntu build job')
}

function verifyArchJob(job, errors) {
  const install = 'pacman -U --noconfirm ./apps/buddy/.output/artifacts/arch/Lexora-Buddy-*-arch-x86_64.pkg.tar.zst'
  const petSmoke = '--buddy-native-pet-smoke-check'
  const guiSmoke = 'xvfb-run -a dbus-run-session -- node packaging/buddy/ci/run-gui-smoke.mjs'
  const upload = 'name: lexora-buddy-arch'

  requireFragments(job, [
    'timeout-minutes: 60',
    'container: archlinux:latest',
    'libxcrypt-compat',
    'pnpm --filter @lexora/buddy package:arch',
  ], errors, 'Arch verification job must build the first-party pacman package with the required Arch compatibility libraries')
  if (/needs:\s*build-ubuntu/.test(job) || [
    'name: lexora-buddy-ubuntu',
    'makepkg',
    'LEXORA_BUDDY_DEB_',
    'lexora-buddy-bin',
  ].some(fragment => job.includes(fragment))) {
    errors.push('Arch release build must not use the downstream AUR recipe or Ubuntu deb')
  }
  requireOrder(job, install, petSmoke, errors, 'Arch build job must install the pacman package before installed Desktop and pet smokes')
  requireOrder(job, install, guiSmoke, errors, 'Arch build job must install the pacman package before installed Desktop and pet smokes')
  requireOrder(job, guiSmoke, upload, errors, 'Arch build job must upload the verified pacman package')
  requireFragments(job, [
    'LEXORA_GUI_SMOKE_NO_SANDBOX: \'1\'',
    'apps/buddy/.output/artifacts/arch/*.pkg.tar.zst',
    'timeout-minutes: 2',
    'include-hidden-files: true',
    'compression-level: 0',
    'retention-days: 7',
    'if: inputs.upload-artifacts',
  ], errors, 'Arch build job must smoke and upload the verified pacman package with bounded retention')
  forbidReleaseMutation(job, errors, 'Arch build job')
}

function verifyPublishJob(job, errors) {
  requireFragments(job, [
    'needs: [validate-release, buddy-packages]',
    'timeout-minutes: 15',
    'environment: buddy-release',
    'actions: read',
    'attestations: write',
    'artifact-metadata: write',
    'contents: write',
    'id-token: write',
    'name: lexora-buddy-ubuntu',
    'name: lexora-buddy-arch',
    'node packaging/buddy/release/verify-release-artifacts.mjs',
    `EXPECTED_COMMIT: ${githubExpression('needs.validate-release.outputs.commit')}`,
    `EXPECTED_TAG: ${githubExpression('needs.validate-release.outputs.tag')}`,
    `EXPECTED_VERSION: ${githubExpression('needs.validate-release.outputs.version')}`,
    '"$LEXORA_BUDDY_RELEASE_TAG" != "$EXPECTED_TAG"',
    '"$LEXORA_BUDDY_VERSION" != "$EXPECTED_VERSION"',
    '"$(git rev-parse HEAD)" != "$EXPECTED_COMMIT"',
    'gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs"',
    '-f ref="refs/tags/$RELEASE_TAG"',
    '-f sha="$RELEASE_COMMIT"',
  ], errors, 'Release publication must use both verified platform artifacts and the validated transition with minimal publication permissions')
  if (/package:(?:arch|deb)|package-desktop\.mjs|pnpm check:buddy/.test(job))
    errors.push('Release publication must not rebuild platform packages')

  requireOrder(job, 'actions/attest@', 'gh api --method POST', errors, 'Release publication must attest artifacts before creating the immutable tag')
  requireOrder(job, 'gh api --method POST', 'gh release create', errors, 'Release publication must create the immutable tag before creating a Release')
  requireOrder(job, 'gh release create', 'gh release upload', errors, 'Release publication must create a draft before uploading immutable assets')
  requireOrder(job, 'gh release upload', 'gh release edit', errors, 'Release publication must publish only after immutable assets are uploaded')
  requireFragments(job, [
    'actions/attest@',
    '--verify-tag',
    '--generate-notes',
    '--draft',
    '--draft=false',
    '--title "Lexora $LEXORA_BUDDY_VERSION"',
    '"$LEXORA_BUDDY_DEB_PATH#$LEXORA_BUDDY_RELEASE_ASSET_NAME"',
    '"$LEXORA_BUDDY_ARCH_PATH#$LEXORA_BUDDY_ARCH_ASSET_NAME"',
    '"$LEXORA_BUDDY_CHECKSUM_PATH#$LEXORA_BUDDY_CHECKSUM_ASSET_NAME"',
  ], errors, 'Release publication must attest and upload both packages and the checksum manifest under a Lexora title')
}

function verifyPublicAssetsJob(job, errors) {
  requireFragments(job, [
    'needs: publish-release',
    'timeout-minutes: 15',
    'attestations: read',
    'name: lexora-buddy-ubuntu',
    'name: lexora-buddy-arch',
    'node packaging/buddy/release/verify-release-artifacts.mjs',
    'gh attestation verify "$LEXORA_BUDDY_DEB_PATH"',
    'gh attestation verify "$LEXORA_BUDDY_ARCH_PATH"',
    'gh attestation verify "$LEXORA_BUDDY_CHECKSUM_PATH"',
    'verify-remote-asset.mjs --asset deb',
    'verify-remote-asset.mjs --asset arch',
    'verify-remote-asset.mjs --asset checksums',
  ], errors, 'Public asset verification must remotely verify both packages, their attestations and the checksum manifest')
  if (job.includes('contents: write') || /gh release (?:create|upload|edit)/.test(job))
    errors.push('Public asset verification must remain read-only')
}

function verifyPinnedActions(workflows, errors) {
  const actions = workflows.matchAll(/^\s*uses:\s+([^\s#]+)(?:\s+#.*)?$/gm)
  for (const [, action] of actions) {
    if (action.startsWith('./'))
      continue
    const separator = action.lastIndexOf('@')
    const reference = separator >= 0 ? action.slice(separator + 1) : ''
    if (!/^[a-f\d]{40}$/.test(reference))
      errors.push(`GitHub Action must use an immutable commit SHA: ${action}`)
  }
}

function requireGlobalReadOnly(workflow, errors, label) {
  if (!/^permissions:\n {2}contents: read$/m.test(workflow))
    errors.push(`${label} must default to read-only repository contents`)
}

function requireFragments(input, fragments, errors, message) {
  if (fragments.some(fragment => !input.includes(fragment)))
    errors.push(message)
}

function forbidFragments(input, fragments, errors, message) {
  if (fragments.some(fragment => input.includes(fragment)))
    errors.push(message)
}

function requireOrder(input, first, second, errors, message) {
  const firstOffset = input.indexOf(first)
  const secondOffset = input.indexOf(second)
  if (firstOffset < 0 || secondOffset < 0 || firstOffset >= secondOffset)
    errors.push(message)
}

function forbidReleaseMutation(job, errors, label) {
  if (/gh release (?:create|upload|edit)/.test(job))
    errors.push(`${label} must not mutate GitHub Releases`)
}

function readJob(workflow, name) {
  const marker = `\n  ${name}:\n`
  const start = workflow.indexOf(marker)
  if (start < 0)
    return ''

  const contentStart = start + 1
  const remainder = workflow.slice(start + marker.length)
  const nextJob = remainder.match(/\n {2}[a-z][\w-]*:\n/)
  const end = nextJob ? start + marker.length + nextJob.index : workflow.length
  return workflow.slice(contentStart, end)
}

function readWorkflow(cwd, path) {
  const absolutePath = resolve(cwd, path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const errors = verifyBuddyReleaseWorkflow()
  if (errors.length > 0)
    throw new Error(errors.join('\n'))

  writeOutput('Buddy release workflow contract passed')
}
