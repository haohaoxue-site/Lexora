import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = join(scriptDir, 'lexora-buddy-bin')

export function verifyBuddyAurPackage(options = {}) {
  const pkgbuild = options.pkgbuild ?? readFileSync(join(packageDir, 'PKGBUILD'), 'utf8')
  const srcinfo = options.srcinfo ?? readFileSync(join(packageDir, '.SRCINFO'), 'utf8')
  const version = options.version ?? readAssignment(pkgbuild, 'pkgver')
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

  const pkgbuildHash = pkgbuild.match(
    /^_deb_sha256="\$\{LEXORA_BUDDY_DEB_SHA256:-([a-f\d]{64})\}"$/m,
  )?.[1]
  const srcinfoHash = srcinfo.match(/^\s*sha256sums_x86_64 = ([a-f\d]{64})$/m)?.[1]
  if (!pkgbuildHash || pkgbuildHash !== srcinfoHash)
    errors.push('AUR PKGBUILD and .SRCINFO deb sha256 must match')

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

function readAssignment(source, key) {
  return source.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? ''
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = verifyBuddyAurPackage()
  if (errors.length) {
    writeError(errors.join('\n'))
    process.exit(1)
  }
  writeOutput('Buddy AUR package contract passed')
}
