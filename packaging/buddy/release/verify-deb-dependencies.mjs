import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const buddyRoot = resolve(repoRoot, 'apps/buddy')
const requiredDependencies = ['bubblewrap', 'git', 'libgtk-3-0', 'libgtk-layer-shell0']
const artifactBufferLimit = 512 * 1024 * 1024

async function main() {
  const packageJson = JSON.parse(await readFile(resolve(buddyRoot, 'package.json'), 'utf8'))
  const artifact = await findLatestArtifact(packageJson.version)
  const dependencies = parseDependencies(extractControl(artifact))
  const missingDependencies = requiredDependencies.filter(dependency => !dependencies.has(dependency))
  const payload = extractData(artifact)
  const entries = listTarEntries(payload)
  const petEntry = './opt/Lexora Buddy/resources/native-pet/lexora-buddy-pet'
  const asarEntry = './opt/Lexora Buddy/resources/app.asar'
  const desktopEntry = './usr/share/applications/site.haohaoxue.LexoraBuddy.desktop'

  if (missingDependencies.length)
    throw new Error(`Deb package is missing Buddy Local Service dependencies: ${missingDependencies.join(', ')}`)
  if (!entries.has(petEntry))
    throw new Error(`Deb package is missing native pet executable: ${petEntry}`)
  if (!entries.has(asarEntry))
    throw new Error(`Deb package is missing Electron app archive: ${asarEntry}`)
  if (!entries.has(desktopEntry))
    throw new Error(`Deb package is missing Desktop entry: ${desktopEntry}`)
  for (const size of [16, 24, 32, 48, 64, 96, 128, 256, 512]) {
    const iconEntry = `./usr/share/icons/hicolor/${size}x${size}/apps/lexora-buddy.png`
    if (!entries.has(iconEntry))
      throw new Error(`Deb package is missing application icon: ${iconEntry}`)
  }
  if ([...entries].some(entry => entry.includes('lexora-buddy-runtime')))
    throw new Error('Deb package still contains the removed Rust Buddy runtime')

  const appAsar = extractTarEntry(payload, asarEntry)
  if (!appAsar.includes(Buffer.from('buddy-service.js')))
    throw new Error('Deb app.asar is missing .output/build/electron/main/buddy-service.js')
  if (!appAsar.includes(Buffer.from('ModelRuntime')))
    throw new Error('Deb app.asar is missing the bundled Pi runtime')

  const desktopFile = extractTarEntry(payload, desktopEntry).toString('utf8')
  for (const fragment of [
    'Name=Lexora Buddy',
    'Exec="/opt/Lexora Buddy/lexora-buddy" %U',
    'Icon=lexora-buddy',
    'StartupWMClass=site.haohaoxue.LexoraBuddy',
  ]) {
    if (!desktopFile.includes(fragment))
      throw new Error(`Deb Desktop entry is missing: ${fragment}`)
  }

  writeOutput(`Verified Deb Buddy Local Service boundary and dependencies: ${requiredDependencies.join(', ')}`)
}

async function findLatestArtifact(version) {
  const outputDirectory = resolveBuddyOutputPaths(repoRoot).artifacts.desktop
  const candidates = (await readdir(outputDirectory))
    .filter(name => name.startsWith(`Lexora-Buddy-${version}-linux-`) && name.endsWith('.deb'))
    .map(name => resolve(outputDirectory, name))

  if (candidates.length === 0)
    throw new Error(`No Lexora ${version} Deb artifact found in ${outputDirectory}`)

  const withStats = await Promise.all(candidates.map(async path => ({
    path,
    modifiedAt: (await stat(path)).mtimeMs,
  })))
  withStats.sort((left, right) => right.modifiedAt - left.modifiedAt)
  return withStats[0].path
}

function extractControl(artifact) {
  const members = run('ar', ['t', artifact]).trim().split(/\r?\n/)
  const controlArchive = members.find(member => /^control\.tar\.(?:xz|gz|zst)$/.test(member))
  if (!controlArchive)
    throw new Error(`Deb control archive is missing: ${artifact}`)

  const archive = runBuffer('ar', ['p', artifact, controlArchive])
  const compressionArgs = controlArchive.endsWith('.xz')
    ? ['-xJOf']
    : controlArchive.endsWith('.gz') ? ['-xzOf'] : ['--zstd', '-xOf']
  return run('tar', [...compressionArgs, '-', './control'], archive)
}

function extractData(artifact) {
  const members = run('ar', ['t', artifact]).trim().split(/\r?\n/)
  const name = members.find(member => /^data\.tar\.(?:xz|gz|zst)$/.test(member))
  if (!name)
    throw new Error(`Deb data archive is missing: ${artifact}`)
  return { archive: runBuffer('ar', ['p', artifact, name]), name }
}

function listTarEntries(payload) {
  const args = compressionArgs(payload.name, 'list')
  return new Set(run('tar', args, payload.archive).trim().split(/\r?\n/).filter(Boolean))
}

function extractTarEntry(payload, path) {
  return runBuffer('tar', [...compressionArgs(payload.name, 'extract'), path], payload.archive)
}

function compressionArgs(name, operation) {
  const suffix = name.endsWith('.xz') ? 'J' : name.endsWith('.gz') ? 'z' : '--zstd'
  if (suffix === '--zstd')
    return operation === 'list' ? ['--zstd', '-tf', '-'] : ['--zstd', '-xOf', '-']
  return operation === 'list' ? [`-t${suffix}f`, '-'] : [`-x${suffix}Of`, '-']
}

function parseDependencies(control) {
  const lines = control.split(/\r?\n/)
  const fieldIndex = lines.findIndex(line => line.startsWith('Depends:'))
  if (fieldIndex < 0)
    return new Set()

  const fieldLines = [lines[fieldIndex].slice('Depends:'.length)]
  for (let index = fieldIndex + 1; index < lines.length && /^[ \t]/.test(lines[index]); index++)
    fieldLines.push(lines[index].trim())

  return new Set(fieldLines.join(' ')
    .split(',')
    .map(value => value.trim().split(/[ (|]/, 1)[0])
    .filter(Boolean))
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: artifactBufferLimit,
  })
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || `${command} exited with ${result.status ?? 'unknown status'}`)

  return result.stdout
}

function runBuffer(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    input,
    maxBuffer: artifactBufferLimit,
  })
  if (result.status !== 0)
    throw new Error(result.stderr.toString() || result.error?.message || `${command} exited with ${result.status ?? 'unknown status'}`)

  return result.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  void main().catch((error) => {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
