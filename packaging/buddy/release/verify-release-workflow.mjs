import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const releaseWorkflowPath = '.github/workflows/buddy-release.yml'

export function verifyBuddyReleaseWorkflow(cwd = repoRoot) {
  const workflow = readFileSync(resolve(cwd, releaseWorkflowPath), 'utf8')
  const jobs = {
    arch: readJob(workflow, 'build-arch'),
    publicAssets: readJob(workflow, 'verify-public-assets'),
    publish: readJob(workflow, 'publish-release'),
    ubuntu: readJob(workflow, 'build-ubuntu'),
  }
  const errors = []

  requireFragments(workflow, [
    'name: Lexora Buddy Release',
    'pull_request:',
    'push:',
    'branches: [master]',
    'workflow_dispatch:',
    'publish_release:',
  ], errors, 'Buddy release workflow must verify changes automatically and publish only through an explicit input')
  if (!/^permissions:\n {2}contents: read$/m.test(workflow))
    errors.push('Buddy release workflow must default to read-only repository contents')
  if ((workflow.match(/contents: write/g) ?? []).length !== 1)
    errors.push('Only the release publication job may have contents write permission')
  if (workflow.includes('--clobber'))
    errors.push('Buddy release workflow must not overwrite immutable release assets')

  verifyUbuntuJob(jobs.ubuntu, errors)
  verifyArchJob(jobs.arch, errors)
  verifyPublishJob(jobs.publish, errors)
  verifyPublicAssetsJob(jobs.publicAssets, errors)

  return errors
}

function verifyUbuntuJob(job, errors) {
  const install = 'sudo apt-get install -y ./apps/buddy/.output/artifacts/desktop/Lexora-Buddy-*-linux-amd64.deb'
  const smoke = 'xvfb-run -a node packaging/buddy/ci/run-gui-smoke.mjs'

  requireFragments(job, ['pnpm check:buddy'], errors, 'Ubuntu build job must run the Buddy release gate')
  requireOrder(job, install, smoke, errors, 'Ubuntu build job must install the built Desktop deb before GUI smoke')
  requireFragments(job, [
    'LEXORA_DESKTOP_EXECUTABLE_PATH: /opt/lexora-buddy/lexora-buddy',
    'LEXORA_BUDDY_PET_PATH: /opt/lexora-buddy/resources/native-pet/lexora-buddy-pet',
    'timeout-minutes: 2',
  ], errors, 'Ubuntu build job must run GUI smoke against the installed Desktop and native pet')
  requireFragments(job, [
    'name: lexora-buddy-ubuntu',
    'apps/buddy/.output/artifacts/desktop/*.deb',
  ], errors, 'Ubuntu build job must upload the verified deb artifact')
  forbidReleaseMutation(job, errors, 'Ubuntu build job')
}

function verifyArchJob(job, errors) {
  const install = 'pacman -U --noconfirm ./apps/buddy/.output/artifacts/arch/Lexora-Buddy-*-arch-x86_64.pkg.tar.zst'
  const petSmoke = '--buddy-native-pet-smoke-check'
  const guiSmoke = 'xvfb-run -a dbus-run-session -- node packaging/buddy/ci/run-gui-smoke.mjs'
  const upload = 'name: lexora-buddy-arch'

  requireFragments(job, [
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
  ], errors, 'Arch build job must smoke and upload the verified pacman package')
  forbidReleaseMutation(job, errors, 'Arch build job')
}

function verifyPublishJob(job, errors) {
  const publicationGuard = 'if: $'
    + '{{ github.event_name == \'workflow_dispatch\' && inputs.publish_release && github.ref == \'refs/heads/master\' }}'
  if (!job.includes(publicationGuard))
    errors.push('Release publication must require an explicit workflow dispatch from master')
  if (!/needs:\s*\[build-ubuntu, build-arch\]/.test(job))
    errors.push('Release publication must depend on both Ubuntu and Arch verification jobs')
  requireFragments(job, [
    'name: buddy-release',
    'contents: write',
    'name: lexora-buddy-ubuntu',
    'name: lexora-buddy-arch',
    'node packaging/buddy/release/verify-release-artifacts.mjs',
  ], errors, 'Release publication must use the protected Environment and both verified platform artifacts')
  if (/package:(?:arch|deb)|package-desktop\.mjs|pnpm check:buddy/.test(job))
    errors.push('Release publication must not rebuild platform packages')

  requireOrder(job, 'gh release create', 'gh release upload', errors, 'Release publication must create a draft before uploading immutable assets')
  requireOrder(job, 'gh release upload', 'gh release edit', errors, 'Release publication must publish only after immutable assets are uploaded')
  requireFragments(job, [
    'gh release view',
    '--draft',
    '--draft=false',
    '--title "Lexora Buddy $LEXORA_BUDDY_VERSION"',
    '"$LEXORA_BUDDY_DEB_PATH#$LEXORA_BUDDY_RELEASE_ASSET_NAME"',
    '"$LEXORA_BUDDY_ARCH_PATH#$LEXORA_BUDDY_ARCH_ASSET_NAME"',
    '"$LEXORA_BUDDY_CHECKSUM_PATH#$LEXORA_BUDDY_CHECKSUM_ASSET_NAME"',
  ], errors, 'Release publication must upload the deb, pacman package and checksum manifest')
}

function verifyPublicAssetsJob(job, errors) {
  requireFragments(job, [
    'needs: publish-release',
    'name: lexora-buddy-ubuntu',
    'name: lexora-buddy-arch',
    'node packaging/buddy/release/verify-release-artifacts.mjs',
    'verify-remote-asset.mjs --asset deb',
    'verify-remote-asset.mjs --asset arch',
    'verify-remote-asset.mjs --asset checksums',
  ], errors, 'Public asset verification must remotely verify both packages and the checksum manifest')
  if (job.includes('contents: write') || /gh release (?:create|upload|edit)/.test(job))
    errors.push('Public asset verification must remain read-only')
}

function requireFragments(input, fragments, errors, message) {
  if (fragments.some(fragment => !input.includes(fragment)))
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const errors = verifyBuddyReleaseWorkflow()
  if (errors.length > 0)
    throw new Error(errors.join('\n'))

  writeOutput('Buddy release workflow contract passed')
}
