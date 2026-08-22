import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'
import { assertPetBinaryBoundary } from './pet-binary-contract.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const artifactBufferLimit = 512 * 1024 * 1024
const requiredDependencies = ['bubblewrap', 'git', 'gtk-layer-shell', 'gtk3']
const iconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

export function readBuddyPacmanReleaseMetadata(cwd = repoRoot) {
  const version = String(JSON.parse(
    readFileSync(join(cwd, 'apps/buddy/buddy.version.json'), 'utf8'),
  ).version)
  const releaseAssetName = `Lexora-Buddy-${version}-arch-x86_64.pkg.tar.zst`

  return {
    archPath: join(resolveBuddyOutputPaths(cwd).artifacts.arch, releaseAssetName),
    releaseAssetName,
    version,
  }
}

export function verifyBuddyPacmanPackage(options = {}) {
  const metadata = readBuddyPacmanReleaseMetadata(options.cwd)
  const archPath = options.archPath ?? metadata.archPath
  if (!existsSync(archPath))
    throw new Error(`Buddy pacman package does not exist: ${archPath}`)

  verifyBuddyPacmanPackageInfo(
    options.packageInfo ?? extractPackageEntry(archPath, '.PKGINFO').toString('utf8'),
    metadata.version,
  )

  const appAsarEntry = 'opt/lexora-buddy/resources/app.asar'
  const desktopEntry = 'usr/share/applications/site.haohaoxue.LexoraBuddy.desktop'
  const petEntry = 'opt/lexora-buddy/resources/native-pet/lexora-buddy-pet'
  const entries = new Set(listPackageEntries(archPath))
  const requiredEntries = [
    'opt/lexora-buddy/lexora-buddy',
    petEntry,
    appAsarEntry,
    desktopEntry,
    ...iconSizes.map(size => `usr/share/icons/hicolor/${size}x${size}/apps/lexora-buddy.png`),
  ]
  for (const entry of requiredEntries) {
    if (!entries.has(entry))
      throw new Error(`Pacman package is missing: ${entry}`)
  }
  if ([...entries].some(entry => entry.includes('lexora-buddy-runtime')))
    throw new Error('Pacman package still contains the removed Rust Buddy runtime')

  assertPetBinaryBoundary(extractPackageEntry(archPath, petEntry))
  verifyAppAsar(extractPackageEntry(archPath, appAsarEntry))
  verifyDesktopEntry(extractPackageEntry(archPath, desktopEntry).toString('utf8'))

  return { ...metadata, archPath }
}

export function verifyBuddyPacmanPackageInfo(input, version) {
  const packageInfo = parsePackageInfo(input)
  verifyPackageInfoField(packageInfo, 'pkgname', 'lexora-buddy')
  verifyPackageInfoField(packageInfo, 'pkgver', `${version}-1`)
  verifyPackageInfoField(packageInfo, 'arch', 'x86_64')
  if (!packageInfo.get('pkgdesc')?.[0])
    throw new Error('Buddy pacman package description is missing')

  const dependencies = new Set(packageInfo.get('depend') ?? [])
  const missingDependencies = requiredDependencies.filter(dependency => !dependencies.has(dependency))
  if (missingDependencies.length > 0)
    throw new Error(`Pacman package is missing dependencies: ${missingDependencies.join(', ')}`)
}

function parsePackageInfo(input) {
  const fields = new Map()
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^([^ ]+) = (.*)$/)
    if (!match)
      continue
    const values = fields.get(match[1]) ?? []
    values.push(match[2])
    fields.set(match[1], values)
  }
  return fields
}

function verifyPackageInfoField(fields, name, expected) {
  const actual = fields.get(name)?.[0]
  if (actual !== expected)
    throw new Error(`Pacman ${name} must be ${expected}, received ${actual ?? 'missing'}`)
}

function listPackageEntries(path) {
  return runBsdtar(['-tf', path]).toString('utf8').trim().split(/\r?\n/).filter(Boolean)
}

function extractPackageEntry(path, entry) {
  return runBsdtar(['-xOf', path, entry])
}

function runBsdtar(args) {
  const result = spawnSync('bsdtar', args, { maxBuffer: artifactBufferLimit })
  if (result.status !== 0)
    throw new Error(result.stderr.toString().trim() || result.error?.message || 'Unable to read pacman package')
  return result.stdout
}

function verifyAppAsar(appAsar) {
  if (!appAsar.includes(Buffer.from('buddy-service.js')))
    throw new Error('Pacman app.asar is missing the Buddy Local Service')
  if (!appAsar.includes(Buffer.from('ModelRuntime')))
    throw new Error('Pacman app.asar is missing the bundled Pi runtime')
}

function verifyDesktopEntry(desktopFile) {
  for (const fragment of [
    'Name=Lexora Buddy',
    'Exec=/opt/lexora-buddy/lexora-buddy %U',
    'Icon=lexora-buddy',
    'StartupWMClass=site.haohaoxue.LexoraBuddy',
  ]) {
    if (!desktopFile.includes(fragment))
      throw new Error(`Pacman Desktop entry is missing: ${fragment}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const metadata = verifyBuddyPacmanPackage()
    writeOutput(`Buddy pacman package passed: ${metadata.releaseAssetName}`)
  }
  catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
