import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const versionPattern = /^\d+\.\d+\.\d+$/

export function parseBuddyProductVersion(content) {
  const parsed = JSON.parse(content)
  const version = typeof parsed.version === 'string' ? parsed.version.trim() : ''

  assertBuddyVersion(version)

  return version
}

export function assertBuddyVersion(version) {
  if (!versionPattern.test(version)) {
    throw new Error(
      `Buddy version must use x.y.z numeric format, received: ${version || '<empty>'}`,
    )
  }
}

export function readBuddyVersionState(cwd = repoRoot) {
  const buddyVersionJson = readFileSync(join(cwd, 'apps/buddy/buddy.version.json'), 'utf8')
  const buddyPackageJson = readFileSync(join(cwd, 'apps/buddy/package.json'), 'utf8')
  const cargoToml = readFileSync(join(cwd, 'apps/buddy/src-tauri/Cargo.toml'), 'utf8')
  const pkgbuild = readFileSync(join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD'), 'utf8')
  const srcinfo = readFileSync(join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/.SRCINFO'), 'utf8')
  const tauriConfigJson = readFileSync(join(cwd, 'apps/buddy/src-tauri/tauri.conf.json'), 'utf8')
  const productVersion = parseBuddyProductVersion(buddyVersionJson)

  return {
    buddyPackageVersion: JSON.parse(buddyPackageJson).version ?? '',
    cargoVersion: parseCargoPackageVersion(cargoToml),
    pkgVersion: parsePkgbuildValue(pkgbuild, 'pkgver'),
    productVersion,
    srcinfoSource: parseSrcinfoValue(srcinfo, 'source_x86_64'),
    srcinfoVersion: parseSrcinfoValue(srcinfo, 'pkgver'),
    tauriVersion: JSON.parse(tauriConfigJson).version ?? '',
  }
}

export function validateBuddyVersionState(state) {
  const errors = []
  const expectedSource = `lexora-buddy-${state.productVersion}-amd64.deb::https://github.com/haohaoxue-site/Lexora/releases/download/v${state.productVersion}/Lexora%20Buddy_${state.productVersion}_amd64.deb`

  if (state.buddyPackageVersion !== state.productVersion) {
    errors.push(
      `apps/buddy/package.json version ${state.buddyPackageVersion} does not match apps/buddy/buddy.version.json ${state.productVersion}`,
    )
  }
  if (state.tauriVersion !== state.productVersion) {
    errors.push(
      `apps/buddy/src-tauri/tauri.conf.json version ${state.tauriVersion} does not match apps/buddy/buddy.version.json ${state.productVersion}`,
    )
  }
  if (state.cargoVersion !== state.productVersion) {
    errors.push(
      `apps/buddy/src-tauri/Cargo.toml version ${state.cargoVersion} does not match apps/buddy/buddy.version.json ${state.productVersion}`,
    )
  }
  if (state.pkgVersion !== state.productVersion) {
    errors.push(
      `packaging/buddy/aur/lexora-buddy-bin/PKGBUILD pkgver ${state.pkgVersion} does not match apps/buddy/buddy.version.json ${state.productVersion}`,
    )
  }
  if (state.srcinfoVersion !== state.productVersion) {
    errors.push(
      `packaging/buddy/aur/lexora-buddy-bin/.SRCINFO pkgver ${state.srcinfoVersion} does not match apps/buddy/buddy.version.json ${state.productVersion}`,
    )
  }
  if (state.srcinfoSource !== expectedSource) {
    errors.push(
      `packaging/buddy/aur/lexora-buddy-bin/.SRCINFO source_x86_64 does not match ${expectedSource}`,
    )
  }

  return errors
}

export function writeBuddyVersion(cwd, nextVersion) {
  assertBuddyVersion(nextVersion)

  writeFileSync(
    join(cwd, 'apps/buddy/buddy.version.json'),
    `${JSON.stringify({ version: nextVersion }, null, 2)}\n`,
  )
  writeJsonVersion(join(cwd, 'apps/buddy/package.json'), nextVersion)
  writeJsonVersion(join(cwd, 'apps/buddy/src-tauri/tauri.conf.json'), nextVersion)
  writeText(
    join(cwd, 'apps/buddy/src-tauri/Cargo.toml'),
    content => replaceRequired(
      content,
      /(\[package\]\n(?:[^\n]*\n)*?version = )"[^"]+"/,
      `$1"${nextVersion}"`,
      'Cargo.toml package version',
    ),
  )
  writeText(
    join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD'),
    content => replaceRequired(
      replaceRequired(content, /^pkgver=.+$/m, `pkgver=${nextVersion}`, 'PKGBUILD pkgver'),
      /^pkgrel=.+$/m,
      'pkgrel=1',
      'PKGBUILD pkgrel',
    ),
  )
  writeText(
    join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/.SRCINFO'),
    content => replaceRequired(
      replaceRequired(
        content,
        /^(\s*pkgver = ).+$/m,
        `$1${nextVersion}`,
        '.SRCINFO pkgver',
      ),
      /^(\s*source_x86_64 = lexora-buddy-)\d+\.\d+\.\d+(-amd64\.deb::https:\/\/github\.com\/haohaoxue-site\/Lexora\/releases\/download\/v)\d+\.\d+\.\d+(\/Lexora%20Buddy_)\d+\.\d+\.\d+(_amd64\.deb)$/m,
      `$1${nextVersion}$2${nextVersion}$3${nextVersion}$4`,
      '.SRCINFO source_x86_64',
    ),
  )
}

export function parseCargoPackageVersion(content) {
  const packageStart = content.indexOf('[package]')
  if (packageStart === -1)
    return ''

  const packageBody = content.slice(packageStart)
  const nextSectionIndex = packageBody.slice('[package]'.length).search(/\n\[/)
  const packageSection = nextSectionIndex === -1
    ? packageBody
    : packageBody.slice(0, '[package]'.length + nextSectionIndex)

  return packageSection.match(/^version = "([^"]+)"$/m)?.[1] ?? ''
}

export function parsePkgbuildValue(content, key) {
  return content.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? ''
}

export function parsePkgbuildArrayValue(content, key) {
  return content.match(new RegExp(`^${key}=\\('([^']+)'\\)$`, 'm'))?.[1] ?? ''
}

export function parseSrcinfoValue(content, key) {
  return content.match(new RegExp(`^\\s*${key} = (.+)$`, 'm'))?.[1]?.trim() ?? ''
}

function writeJsonVersion(path, version) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  parsed.version = version
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
}

function writeText(path, update) {
  writeFileSync(path, update(readFileSync(path, 'utf8')))
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content))
    throw new Error(`Unable to update ${label}`)

  return content.replace(pattern, replacement)
}

function runCli(argv) {
  const [command, version] = argv

  if (command === '--check') {
    const errors = validateBuddyVersionState(readBuddyVersionState(repoRoot))

    if (errors.length > 0)
      throw new Error(errors.join('\n'))

    writeOutput('Buddy version check passed')
    return
  }

  if (command === '--set') {
    if (!version)
      throw new Error('Usage: node packaging/buddy/release/buddy-version.mjs --set <x.y.z>')

    writeBuddyVersion(repoRoot, version.trim())
    writeOutput(`Buddy version updated to ${version.trim()}`)
    return
  }

  throw new Error('Usage: node packaging/buddy/release/buddy-version.mjs --check | --set <x.y.z>')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  }
  catch (error) {
    writeError(error.message)
    process.exit(1)
  }
}
