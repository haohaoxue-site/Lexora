import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'
import { assertPetBinaryBoundary } from './pet-binary-contract.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const artifactBufferLimit = 512 * 1024 * 1024
const requiredDependencies = [
  'bubblewrap',
  'git',
  'libgtk-3-0',
  'libgtk-layer-shell0',
  'webp-pixbuf-loader',
]

export function readBuddyDebReleaseMetadata(cwd = repoRoot) {
  const packageMetadata = JSON.parse(readFileSync(join(cwd, 'apps/buddy/package.json'), 'utf8'))
  const version = String(JSON.parse(
    readFileSync(join(cwd, 'apps/buddy/buddy.version.json'), 'utf8'),
  ).version)
  const releaseUrl = String(packageMetadata.homepage ?? '')
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(releaseUrl))
    throw new Error('Buddy package homepage must identify its GitHub repository')

  const releaseAssetName = `Lexora-Buddy-${version}-linux-amd64.deb`
  const releaseTag = `v${version}`

  return {
    debPath: join(resolveBuddyOutputPaths(cwd).artifacts.desktop, releaseAssetName),
    releaseAssetName,
    releaseRepo: new URL(releaseUrl).pathname.replace(/^\//, ''),
    releaseTag,
    sourceUrl: `${releaseUrl}/releases/download/${releaseTag}/${releaseAssetName}`,
    version,
  }
}

export function verifyBuddyDebArtifact(options = {}) {
  const metadata = readBuddyDebReleaseMetadata(options.cwd)
  const debPath = options.debPath ?? metadata.debPath
  if (!existsSync(debPath))
    throw new Error(`Buddy deb artifact does not exist: ${debPath}`)

  return {
    ...metadata,
    debPath,
    hash: createHash('sha256').update(readFileSync(debPath)).digest('hex'),
  }
}

export function verifyBuddyDebPackage(options = {}) {
  const metadata = verifyBuddyDebArtifact(options)
  const archives = extractDebArchives(metadata.debPath)
  try {
    const control = parseDebControl(extractTarEntry(archives.control, './control').toString('utf8'))
    verifyControlField(control, 'Package', 'lexora-buddy')
    verifyControlField(control, 'Version', metadata.version)
    verifyControlField(control, 'Architecture', 'amd64')

    const dependencies = parseDependencies(control.get('Depends') ?? '')
    const missingDependencies = requiredDependencies.filter(dependency => !dependencies.has(dependency))
    if (missingDependencies.length > 0)
      throw new Error(`Deb package is missing dependencies: ${missingDependencies.join(', ')}`)

    const entries = listTarEntries(archives.data)
    const appAsarEntry = './opt/lexora-buddy/resources/app.asar'
    const desktopEntry = './usr/share/applications/site.haohaoxue.LexoraBuddy.desktop'
    const petEntry = './opt/lexora-buddy/resources/native-pet/lexora-buddy-pet'
    const requiredEntries = [
      './opt/lexora-buddy/lexora-buddy',
      petEntry,
      appAsarEntry,
      desktopEntry,
      './usr/share/icons/hicolor/512x512/apps/lexora-buddy.png',
    ]
    verifyPackageEntries(entries, requiredEntries, 'Deb')

    if ([...entries].some(entry => entry.includes('lexora-buddy-runtime')))
      throw new Error('Deb package still contains the removed Rust Buddy runtime')

    assertPetBinaryBoundary(extractTarEntry(archives.data, petEntry))
    verifyAppAsar(extractTarEntry(archives.data, appAsarEntry), 'Deb')
    verifyDesktopEntry(extractTarEntry(archives.data, desktopEntry).toString('utf8'), 'Deb')
  }
  finally {
    rmSync(archives.directory, { force: true, recursive: true })
  }

  return metadata
}

export function writeBuddyDebGithubEnv(path, metadata) {
  const entries = {
    LEXORA_BUDDY_DEB_PATH: metadata.debPath,
    LEXORA_BUDDY_DEB_SHA256: metadata.hash,
    LEXORA_BUDDY_RELEASE_ASSET_NAME: metadata.releaseAssetName,
    LEXORA_BUDDY_RELEASE_REPO: metadata.releaseRepo,
    LEXORA_BUDDY_RELEASE_SOURCE_URL: metadata.sourceUrl,
    LEXORA_BUDDY_RELEASE_TAG: metadata.releaseTag,
    LEXORA_BUDDY_VERSION: metadata.version,
  }
  for (const [key, value] of Object.entries(entries)) {
    if (value.includes('\n') || value.includes('\r'))
      throw new Error(`invalid newline in GitHub environment value: ${key}`)
    appendFileSync(path, `${key}=${value}\n`)
  }
}

function extractDebArchives(artifact) {
  const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-deb-'))
  run('ar', ['x', resolve(artifact)], undefined, directory)
  const members = readdirSync(directory)
  const control = members.find(name => /^control\.tar\.(?:xz|gz|zst)$/.test(name))
  const data = members.find(name => /^data\.tar\.(?:xz|gz|zst)$/.test(name))
  if (!control || !data) {
    rmSync(directory, { force: true, recursive: true })
    throw new Error(`Deb control or data archive is missing: ${artifact}`)
  }
  return {
    control: join(directory, control),
    data: join(directory, data),
    directory,
  }
}

function listTarEntries(archive) {
  return new Set(run('tar', compressionArgs(archive, 'list'))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean))
}

function extractTarEntry(archive, path) {
  return runBuffer('tar', [...compressionArgs(archive, 'extract'), path])
}

function compressionArgs(archive, operation) {
  const operationFlag = operation === 'list' ? 't' : 'xO'
  if (archive.endsWith('.zst'))
    return ['--zstd', `-${operationFlag}f`, archive]
  return [`-${operationFlag}${archive.endsWith('.xz') ? 'J' : 'z'}f`, archive]
}

function parseDebControl(input) {
  const fields = new Map()
  let currentField
  for (const line of input.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && currentField) {
      fields.set(currentField, `${fields.get(currentField)}\n${line.trim()}`)
      continue
    }
    const separator = line.indexOf(':')
    if (separator <= 0)
      continue
    currentField = line.slice(0, separator)
    fields.set(currentField, line.slice(separator + 1).trimStart())
  }
  return fields
}

function parseDependencies(input) {
  return new Set(input
    .split(',')
    .flatMap(value => value.split('|'))
    .map(value => value.trim().split(/[ (]/, 1)[0])
    .filter(Boolean))
}

function verifyControlField(control, name, expected) {
  const actual = control.get(name)
  if (actual !== expected)
    throw new Error(`Deb ${name} must be ${expected}, received ${actual ?? 'missing'}`)
}

function verifyPackageEntries(entries, requiredEntries, label) {
  for (const entry of requiredEntries) {
    if (!entries.has(entry))
      throw new Error(`${label} package is missing: ${entry}`)
  }
}

function verifyAppAsar(appAsar, label) {
  if (!appAsar.includes(Buffer.from('buddy-service.js')))
    throw new Error(`${label} app.asar is missing the Buddy Local Service`)
  if (!appAsar.includes(Buffer.from('ModelRuntime')))
    throw new Error(`${label} app.asar is missing the bundled Pi runtime`)
  for (const entry of ['photon_rs.js', 'photon_rs_bg.wasm']) {
    if (!appAsar.includes(Buffer.from(entry)))
      throw new Error(`${label} app.asar is missing the Photon runtime entry: ${entry}`)
  }
}

function verifyDesktopEntry(desktopFile, label) {
  for (const fragment of [
    'Name=Lexora Buddy',
    'Exec=/opt/lexora-buddy/lexora-buddy %U',
    'Icon=lexora-buddy',
    'StartupWMClass=site.haohaoxue.LexoraBuddy',
  ]) {
    if (!desktopFile.includes(fragment))
      throw new Error(`${label} Desktop entry is missing: ${fragment}`)
  }
}

function run(command, args, input, cwd = repoRoot) {
  return runCommand(command, args, input, 'utf8', cwd)
}

function runBuffer(command, args, input) {
  return runCommand(command, args, input, undefined, repoRoot)
}

function runCommand(command, args, input, encoding, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    input,
    maxBuffer: artifactBufferLimit,
  })
  if (result.status !== 0) {
    const stderr = encoding ? result.stderr : result.stderr?.toString()
    throw new Error(stderr || result.error?.message || `${command} exited with ${result.status ?? 'unknown status'}`)
  }
  return result.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const githubEnvIndex = process.argv.indexOf('--github-env')
    const metadata = verifyBuddyDebPackage()
    if (githubEnvIndex >= 0) {
      const githubEnvPath = process.argv[githubEnvIndex + 1]
      if (!githubEnvPath)
        throw new Error('--github-env requires a path')
      writeBuddyDebGithubEnv(githubEnvPath, metadata)
    }
    writeOutput(`Buddy deb package passed: ${metadata.releaseAssetName}`)
  }
  catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
