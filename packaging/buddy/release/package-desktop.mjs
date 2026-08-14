import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

if (process.platform !== 'linux')
  throw new Error('Lexora Desktop packaging currently supports Linux only')

const paths = resolveBuddyOutputPaths(repoRoot)
const version = JSON.parse(
  readFileSync(join(paths.buddyRoot, 'buddy.version.json'), 'utf8'),
).version

rmSync(paths.package.desktop, { force: true, recursive: true })
rmSync(paths.artifacts.desktop, { force: true, recursive: true })
mkdirSync(paths.artifacts.desktop, { recursive: true })

const result = spawnSync('pnpm', [
  '--filter',
  '@lexora/buddy',
  'exec',
  'electron-builder',
  '--config',
  'electron-builder.config.cjs',
  '--linux',
  'deb',
], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})
if (result.status !== 0)
  throw new Error(`electron-builder failed with exit code ${result.status ?? 'unknown'}`)

const candidates = readdirSync(paths.package.desktop)
  .filter(name => name.startsWith(`Lexora-Buddy-${version}-linux-`) && name.endsWith('.deb'))
if (candidates.length !== 1)
  throw new Error(`Expected one Lexora ${version} Deb artifact, received ${candidates.length}`)

const packagePath = join(paths.package.desktop, candidates[0])
const artifactPath = join(paths.artifacts.desktop, basename(packagePath))
renameSync(packagePath, artifactPath)
writeOutput(artifactPath)
