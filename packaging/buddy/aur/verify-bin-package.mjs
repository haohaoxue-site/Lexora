import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const packageDir = join(scriptDir, 'lexora-buddy-bin')
const linuxWorkflowPath = join(repoRoot, '.github/workflows/buddy-linux-deb.yml')

export function verifyBuddyAurPackage(options = {}) {
  const version = options.version ?? JSON.parse(
    readFileSync(join(repoRoot, 'apps/buddy/buddy.version.json'), 'utf8'),
  ).version
  const pkgbuild = options.pkgbuild ?? readFileSync(join(packageDir, 'PKGBUILD'), 'utf8')
  const srcinfo = options.srcinfo ?? readFileSync(join(packageDir, '.SRCINFO'), 'utf8')
  const workflow = options.workflow ?? readFileSync(linuxWorkflowPath, 'utf8')
  const errors = []
  const requiredPkgbuildFragments = [
    `pkgver=${version}`,
    `_deb_name="Lexora-Buddy-\${pkgver}-linux-amd64.deb"`,
    `releases/download/v\${pkgver}/\${_deb_name}`,
    `source_x86_64=("lexora-buddy-\${pkgver}-amd64.deb::\${_deb_url}")`,
    'data.tar.*',
    'alsa-lib',
    'desktop-file-utils',
    'git',
    'gtk-layer-shell',
    'hicolor-icon-theme',
    'libcups',
    'libxkbcommon',
    'mesa',
    'nss',
    'libsecret',
  ]
  const requiredSrcinfoFragments = [
    `pkgver = ${version}`,
    `source_x86_64 = lexora-buddy-${version}-amd64.deb::https://github.com/haohaoxue-site/Lexora/releases/download/v${version}/Lexora-Buddy-${version}-linux-amd64.deb`,
    'provides = lexora-buddy',
  ]

  for (const fragment of requiredPkgbuildFragments) {
    if (!pkgbuild.includes(fragment))
      errors.push(`PKGBUILD is missing: ${fragment}`)
  }
  for (const fragment of requiredSrcinfoFragments) {
    if (!srcinfo.includes(fragment))
      errors.push(`.SRCINFO is missing: ${fragment}`)
  }

  if (
    !workflow.includes('verify-linux-deb-artifact.mjs --github-env "$GITHUB_ENV"')
    || !workflow.includes('gh release upload')
    || !workflow.includes('--repo "$LEXORA_BUDDY_RELEASE_REPO"')
  ) {
    errors.push('Linux release workflow does not publish the AUR deb asset')
  }
  if (!workflow.includes('node packaging/buddy/release/verify-remote-asset.mjs'))
    errors.push('Linux release workflow does not remotely verify the AUR deb asset')

  const makepkg = spawnSync('makepkg', ['--printsrcinfo'], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  if (!makepkg.error && makepkg.status === 0 && normalize(makepkg.stdout) !== normalize(srcinfo))
    errors.push('.SRCINFO does not match makepkg --printsrcinfo')

  return errors
}

function normalize(value) {
  return value.trim().replaceAll('\r\n', '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = verifyBuddyAurPackage()
  if (errors.length) {
    writeError(errors.join('\n'))
    process.exit(1)
  }
  writeOutput('Buddy AUR package contract passed')
}
