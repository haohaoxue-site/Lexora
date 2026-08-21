import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const versionPattern = /^\d+\.\d+\.\d+$/

export function readBuddyVersionState(cwd = repoRoot) {
  const buddyVersionPath = join(cwd, 'apps/buddy/buddy.version.json')
  const packagePath = join(cwd, 'apps/buddy/package.json')
  const cargoPath = join(cwd, 'apps/buddy/native-pet/Cargo.toml')
  const pkgbuildPath = join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD')
  const srcinfoPath = join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/.SRCINFO')

  return {
    productVersion: readJsonVersion(buddyVersionPath),
    sourceDateEpoch: readJsonSourceDateEpoch(buddyVersionPath),
    packageVersion: readJsonVersion(packagePath),
    cargoVersion: readCargoVersion(cargoPath),
    pkgVersion: readAssignment(pkgbuildPath, 'pkgver'),
    srcinfoSource: readSrcinfoValue(srcinfoPath, 'source_x86_64'),
    srcinfoVersion: readSrcinfoValue(srcinfoPath, 'pkgver'),
  }
}

export function validateBuddyVersionState(state) {
  const errors = []
  if (!versionPattern.test(state.productVersion))
    errors.push(`invalid Buddy product version: ${state.productVersion}`)
  if (!Number.isSafeInteger(state.sourceDateEpoch) || state.sourceDateEpoch <= 0)
    errors.push(`invalid Buddy source date epoch: ${state.sourceDateEpoch}`)
  if (state.packageVersion !== state.productVersion)
    errors.push(`apps/buddy/package.json version ${state.packageVersion} does not match ${state.productVersion}`)
  if (state.cargoVersion !== state.productVersion)
    errors.push(`apps/buddy/native-pet/Cargo.toml version ${state.cargoVersion} does not match ${state.productVersion}`)
  if (state.pkgVersion !== state.productVersion)
    errors.push(`AUR PKGBUILD version ${state.pkgVersion} does not match ${state.productVersion}`)
  if (state.srcinfoVersion !== state.productVersion)
    errors.push(`AUR .SRCINFO version ${state.srcinfoVersion} does not match ${state.productVersion}`)
  const expectedSource = `lexora-buddy-${state.productVersion}-amd64.deb::https://github.com/haohaoxue-site/Lexora/releases/download/v${state.productVersion}/Lexora-Buddy-${state.productVersion}-linux-amd64.deb`
  if (state.srcinfoSource !== expectedSource)
    errors.push(`AUR .SRCINFO source_x86_64 does not match ${expectedSource}`)
  return errors
}

export function writeBuddyVersion(cwd, version) {
  if (!versionPattern.test(version))
    throw new Error(`version must use x.y.z format: ${version}`)

  const sourceDateEpoch = Math.floor(Date.now() / 1000)
  for (const relativePath of ['apps/buddy/buddy.version.json', 'apps/buddy/package.json']) {
    const path = join(cwd, relativePath)
    const value = JSON.parse(readFileSync(path, 'utf8'))
    value.version = version
    if (relativePath === 'apps/buddy/buddy.version.json')
      value.sourceDateEpoch = sourceDateEpoch
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  }

  const cargoPath = join(cwd, 'apps/buddy/native-pet/Cargo.toml')
  const cargo = readFileSync(cargoPath, 'utf8').replace(
    /^(version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`,
  )
  writeFileSync(cargoPath, cargo)

  const pkgbuildPath = join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD')
  writeFileSync(pkgbuildPath, readFileSync(pkgbuildPath, 'utf8')
    .replace(/^pkgver=.+$/m, `pkgver=${version}`)
    .replace(/^pkgrel=.+$/m, 'pkgrel=1'))

  const srcinfoPath = join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/.SRCINFO')
  writeFileSync(srcinfoPath, readFileSync(srcinfoPath, 'utf8')
    .replace(/^(\s*pkgver = ).+$/m, `$1${version}`)
    .replace(
      /^(\s*source_x86_64 = lexora-buddy-)\d+\.\d+\.\d+(-amd64\.deb::https:\/\/github\.com\/haohaoxue-site\/Lexora\/releases\/download\/v)\d+\.\d+\.\d+(\/Lexora-Buddy-)\d+\.\d+\.\d+(-linux-amd64\.deb)$/m,
      `$1${version}$2${version}$3${version}$4`,
    ))
}

const [command, value] = process.argv.slice(2)
if (command === '--set') {
  writeBuddyVersion(repoRoot, value ?? '')
  writeOutput(`Buddy version updated to ${value}`)
}
else if (command === '--check') {
  const state = readBuddyVersionState()
  const errors = validateBuddyVersionState(state)
  if (errors.length)
    throw new Error(errors.join('\n'))
  writeOutput(`Buddy version check passed: ${state.productVersion}`)
}

function readJsonVersion(path) {
  return String(JSON.parse(readFileSync(path, 'utf8')).version ?? '')
}

function readJsonSourceDateEpoch(path) {
  return Number(JSON.parse(readFileSync(path, 'utf8')).sourceDateEpoch)
}

function readCargoVersion(path) {
  return readFileSync(path, 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? ''
}

function readAssignment(path, key) {
  return readFileSync(path, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? ''
}

function readSrcinfoValue(path, key) {
  return readFileSync(path, 'utf8').match(new RegExp(`^\\s*${key} = (.+)$`, 'm'))?.[1]?.trim() ?? ''
}
