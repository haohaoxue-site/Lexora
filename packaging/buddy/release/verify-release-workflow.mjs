import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { classifyCiScope } from '../../../infrastructure/scripts/resolve-ci-scope.mjs'
import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const workflowPaths = {
  build: '.github/workflows/buddy-build.yml',
  ci: '.github/workflows/ci.yml',
  release: '.github/workflows/release.yml',
}

export function verifyBuddyReleaseWorkflow(cwd = repoRoot) {
  const workflows = Object.fromEntries(
    Object.entries(workflowPaths).map(([name, path]) => [name, readWorkflow(cwd, path)]),
  )
  const errors = []

  verifyCiWorkflow(workflows.ci, errors)
  verifyCiScopeClassification(errors)
  verifyBuildWorkflow(workflows.build, errors)
  verifyReleaseWorkflow(workflows.release, errors)
  verifyPinnedActions(Object.values(workflows).join('\n'), errors)

  return errors
}

function verifyCiWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Lexora CI',
    'pull_request:',
    'ready_for_review',
    'push:',
    'branches: [master]',
    'contents: read',
    'cancel-in-progress: true',
  ], errors, 'Lexora CI must run read-only for pull requests and master pushes')
  requireGlobalReadOnly(workflow, errors, 'Lexora CI')
  forbidFragments(workflow, [
    'workflow_dispatch:',
    'tags:',
    'paths:',
    'contents: write',
  ], errors, 'Lexora CI must cover every pull request without a publication path')

  const scope = readJob(workflow, 'scope')
  requireFragments(scope, [
    'fetch-depth: 0',
    'node infrastructure/scripts/resolve-ci-scope.mjs',
    '--github-output "$GITHUB_OUTPUT"',
  ], errors, 'Lexora CI must resolve cumulative change scope from the full comparison history')

  requireFragments(
    readFileSync(resolve(repoRoot, 'infrastructure/scripts/resolve-ci-scope.mjs'), 'utf8'),
    ['--no-renames'],
    errors,
    'Lexora CI scope resolution must classify both sides of renamed paths',
  )

  const docs = readJob(workflow, 'docs-quality')
  requireFragments(docs, [
    'needs: scope',
    'needs.scope.outputs.docs == \'true\'',
    'pnpm --filter @haohaoxue/lexora --filter @haohaoxue/lexora-docs install --frozen-lockfile',
    'pnpm --filter @haohaoxue/lexora-docs lint',
    'pnpm --filter @haohaoxue/lexora-docs build',
  ], errors, 'Lexora CI must lint and build Docs only when documentation changes')

  const quality = readJob(workflow, 'quality')
  requireFragments(quality, [
    'needs: scope',
    'needs.scope.outputs.quality == \'true\'',
    'timeout-minutes: 30',
    'pnpm install --frozen-lockfile',
    'run: pnpm lint',
    'run: pnpm type-check',
    'run: pnpm test',
    'pnpm --filter \'!@lexora/buddy\' --filter \'!@haohaoxue/lexora-docs\' --recursive --if-present build',
  ], errors, 'Lexora CI quality job must lint, type-check, test and build the workspace')

  const packages = readJob(workflow, 'buddy-packages')
  requireFragments(packages, [
    'needs: [scope, quality]',
    'needs.scope.outputs.buddy == \'true\'',
    'github.event.pull_request.draft == false',
    'uses: ./.github/workflows/buddy-build.yml',
    'upload-artifacts: false',
  ], errors, 'Lexora CI must run Buddy package verification only for affected ready changes without uploading artifacts')

  const gate = readJob(workflow, 'ci-gate')
  requireFragments(gate, [
    'needs: [scope, docs-quality, quality, buddy-packages]',
    'if: always()',
    'needs.scope.result',
    'needs.docs-quality.result',
    'needs.quality.result',
    'needs.buddy-packages.result',
  ], errors, 'Lexora CI must expose one stable gate that requires every selected check to succeed')
}

function verifyCiScopeClassification(errors) {
  const cases = [
    [['apps/docs/src/index.md'], { buddy: false, docs: true, quality: false }],
    [['apps/web/src/main.ts'], { buddy: false, docs: false, quality: true }],
    [['apps/docs/src/index.md', 'packages/contracts/src/index.ts'], { buddy: false, docs: true, quality: true }],
    [['apps/buddy/electron/main/index.ts'], { buddy: true, docs: false, quality: true }],
    [['packages/assets/brand/app-icon.png'], { buddy: true, docs: false, quality: true }],
    [['packages/assets/buddy/pets/default/manifest.json'], { buddy: true, docs: false, quality: true }],
    [['pnpm-lock.yaml'], { buddy: true, docs: false, quality: true }],
    [['infrastructure/scripts/resolve-ci-scope.mjs'], { buddy: true, docs: false, quality: true }],
    [['future/product/input.txt'], { buddy: true, docs: false, quality: true }],
    [[], { buddy: true, docs: false, quality: true }],
  ]

  if (cases.some(([files, expected]) => (
    JSON.stringify(classifyCiScope(files)) !== JSON.stringify(expected)
  ))) {
    errors.push('Lexora CI scope classification must keep Docs isolated and unknown build inputs conservative')
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

  verifyUbuntuJob(readJob(workflow, 'build-ubuntu'), errors)
  verifyArchJob(readJob(workflow, 'build-arch'), errors)
}

function verifyReleaseWorkflow(workflow, errors) {
  requireFragments(workflow, [
    'name: Lexora Release',
    'push:',
    'tags:',
    '- \'v*\'',
    'contents: read',
    'cancel-in-progress: false',
  ], errors, 'Lexora Release must run automatically and read-only by default for v* tags')
  requireGlobalReadOnly(workflow, errors, 'Lexora Release')
  forbidFragments(workflow, [
    'pull_request:',
    'branches:',
    'workflow_dispatch:',
    'publish_release:',
    '--clobber',
  ], errors, 'Lexora Release must not expose branch, manual or overwrite publication paths')
  if ((workflow.match(/contents: write/g) ?? []).length !== 1)
    errors.push('Only the release publication job may have contents write permission')

  verifyReleaseValidationJob(readJob(workflow, 'validate-release'), errors)

  const packages = readJob(workflow, 'buddy-packages')
  requireFragments(packages, [
    'needs: validate-release',
    'uses: ./.github/workflows/buddy-build.yml',
    'upload-artifacts: true',
  ], errors, 'Lexora Release must build packages only after tag validation')

  verifyPublishJob(readJob(workflow, 'publish-release'), errors)
  verifyPublicAssetsJob(readJob(workflow, 'verify-public-assets'), errors)
}

function verifyReleaseValidationJob(job, errors) {
  requireFragments(job, [
    'timeout-minutes: 10',
    'fetch-depth: 0',
    'node packaging/release/version.mjs --check-tag "$GITHUB_REF_NAME"',
    '+refs/heads/master:refs/remotes/origin/master',
    'git merge-base --is-ancestor "$release_commit" origin/master',
    'gh api "repos/$GITHUB_REPOSITORY/releases/tags/$GITHUB_REF_NAME"',
    'HTTP 404',
  ], errors, 'Release validation must bind a strict version tag to a master commit and reject an existing Release')
}

function verifyUbuntuJob(job, errors) {
  const install = 'sudo apt-get install -y ./apps/buddy/.output/artifacts/desktop/Lexora-Buddy-*-linux-amd64.deb'
  const smoke = 'xvfb-run -a node packaging/buddy/ci/run-gui-smoke.mjs'

  requireFragments(job, [
    'timeout-minutes: 60',
    'pnpm check:buddy',
  ], errors, 'Ubuntu build job must run the Buddy release gate with a bounded timeout')
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
    'needs: buddy-packages',
    'timeout-minutes: 15',
    'actions: read',
    'attestations: write',
    'artifact-metadata: write',
    'contents: write',
    'id-token: write',
    'name: lexora-buddy-ubuntu',
    'name: lexora-buddy-arch',
    'node packaging/buddy/release/verify-release-artifacts.mjs',
    '"$LEXORA_BUDDY_RELEASE_TAG" != "$GITHUB_REF_NAME"',
  ], errors, 'Release publication must use both verified platform artifacts with minimal publication permissions')
  if (/package:(?:arch|deb)|package-desktop\.mjs|pnpm check:buddy/.test(job))
    errors.push('Release publication must not rebuild platform packages')

  requireOrder(job, 'actions/attest@', 'gh release create', errors, 'Release publication must attest artifacts before creating a Release')
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
