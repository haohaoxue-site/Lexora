import { spawnSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'
import { resolvePackageTargetPlatform } from './platform-definition.mjs'
import { verifyElectronBundle } from './verify-electron-bundle.mjs'
import { verifyDesktopDirectory, verifyLinuxPackage } from './verify-package.mjs'
import { readBuddyReleaseMetadata } from './verify-release-artifacts.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--target')
  throw new Error('Usage: package-desktop.mjs --target deb|pacman|nsis')
const target = args[1]
const platform = resolvePackageTargetPlatform(target)
if (process.platform !== platform.id || process.arch !== 'x64')
  throw new Error(`${target} packaging requires ${platform.id} x64`)

const errors = verifyElectronBundle()
if (errors.length)
  throw new Error(errors.join('\n'))
const paths = resolveBuddyOutputPaths(repoRoot)
const artifact = readBuddyReleaseMetadata(repoRoot).artifacts.find(entry => entry.target === target)
const artifactDirectory = paths.artifacts[artifact.directory]
rmSync(paths.package.desktop, { force: true, recursive: true })
rmSync(artifactDirectory, { force: true, recursive: true })
mkdirSync(artifactDirectory, { recursive: true })

const require = createRequire(join(paths.buddyRoot, 'package.json'))
const result = spawnSync(process.execPath, [
  require.resolve('electron-builder/cli.js'),
  '--config',
  'electron-builder.config.cjs',
  `--${platform.builderPlatform}`,
  target,
  '--x64',
  '--publish',
  'never',
], { cwd: paths.buddyRoot, env: process.env, stdio: 'inherit' })
if (result.error)
  throw result.error
if (result.status !== 0)
  throw new Error(`electron-builder failed: ${result.status ?? result.signal}`)

const packagePath = join(paths.package.desktop, artifact.name)
if (target === 'nsis')
  verifyDesktopDirectory(join(paths.package.desktop, 'win-unpacked'), 'win32')
else
  verifyLinuxPackage(target, packagePath)
renameSync(packagePath, artifact.path)
writeOutput(artifact.path)
