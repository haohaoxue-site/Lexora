import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const target = readTarget()

if (process.platform !== 'linux')
  throw new Error('Lexora Buddy Desktop packaging currently supports Linux only')

const paths = resolveBuddyOutputPaths(repoRoot)
const version = JSON.parse(
  readFileSync(join(paths.buddyRoot, 'buddy.version.json'), 'utf8'),
).version

rmSync(paths.package.desktop, { force: true, recursive: true })
rmSync(target.artifactDirectory(paths), { force: true, recursive: true })
mkdirSync(target.artifactDirectory(paths), { recursive: true })

const result = spawnSync('pnpm', [
  '--filter',
  '@lexora/buddy',
  'exec',
  'electron-builder',
  '--config',
  'electron-builder.config.cjs',
  '--linux',
  target.name,
], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})
if (result.status !== 0)
  throw new Error(`electron-builder failed with exit code ${result.status ?? 'unknown'}`)

const candidates = readdirSync(paths.package.desktop)
  .filter(name => name === target.artifactName(version))
if (candidates.length !== 1)
  throw new Error(`Expected one Lexora ${version} ${target.name} artifact, received ${candidates.length}`)

const packagePath = join(paths.package.desktop, candidates[0])
const artifactPath = join(target.artifactDirectory(paths), basename(packagePath))
renameSync(packagePath, artifactPath)
writeOutput(artifactPath)

function readTarget() {
  const index = process.argv.indexOf('--target')
  const name = index < 0 ? 'deb' : process.argv[index + 1]
  const targets = {
    deb: {
      artifactDirectory: paths => paths.artifacts.desktop,
      artifactName: version => `Lexora-Buddy-${version}-linux-amd64.deb`,
      name: 'deb',
    },
    pacman: {
      artifactDirectory: paths => paths.artifacts.arch,
      artifactName: version => `Lexora-Buddy-${version}-arch-x86_64.pkg.tar.zst`,
      name: 'pacman',
    },
  }
  const target = targets[name]
  if (!target)
    throw new Error('--target must be deb or pacman')
  return target
}
