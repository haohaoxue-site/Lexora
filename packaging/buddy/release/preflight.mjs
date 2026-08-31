import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function createBuddyReleasePreflightSteps() {
  return [
    ['Version consistency', 'node', ['packaging/release/version.mjs', '--check']],
    ['Desktop assets', 'node', ['packaging/buddy/release/verify-desktop-assets.mjs']],
    ['Release workflow', 'node', ['packaging/buddy/release/verify-release-workflow.mjs']],
    ['Desktop source lint', 'pnpm', ['exec', 'eslint', 'apps/buddy', 'packaging/buddy', 'packaging/release']],
    ['Desktop type-check', 'pnpm', ['--filter', '@lexora/buddy', 'type-check']],
    ['Desktop tests', 'pnpm', ['--filter', '@lexora/buddy', 'test']],
    ['Native pet format', 'cargo', ['fmt', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--', '--check']],
    ['Native pet check', 'cargo', ['check', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets']],
    ['Native pet clippy', 'cargo', ['clippy', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets', '--', '-D', 'warnings']],
    ['Native pet tests', 'cargo', ['test', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml']],
    ['Native pet release build', 'cargo', ['build', '--release', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml']],
    ['Electron build', 'pnpm', ['--filter', '@lexora/buddy', 'exec', 'electron-vite', 'build']],
    ['Electron bundle boundary', 'node', ['packaging/buddy/release/verify-electron-bundle.mjs']],
    ['Desktop deb package', 'node', ['packaging/buddy/release/package-desktop.mjs', '--target', 'deb']],
    ['Deb package', 'node', ['packaging/buddy/release/verify-deb-package.mjs']],
  ].map(([label, command, args]) => ({ label, command, args }))
}

export function createBuddyReleaseEnvironment(
  env,
  defaultSourceDateEpoch,
  cargoTargetDirectory = resolveBuddyOutputPaths(repoRoot).build.nativePet,
) {
  const sourceDateEpoch = env.SOURCE_DATE_EPOCH ?? defaultSourceDateEpoch
  if (!/^\d+$/.test(sourceDateEpoch))
    throw new Error('Buddy release SOURCE_DATE_EPOCH must be a Unix timestamp')
  return {
    ...env,
    CARGO_TARGET_DIR: env.CARGO_TARGET_DIR ?? cargoTargetDirectory,
    RUSTFLAGS: env.RUSTFLAGS ?? '-D warnings',
    RUST_MIN_STACK: env.RUST_MIN_STACK ?? '16777216',
    SOURCE_DATE_EPOCH: sourceDateEpoch,
  }
}

export function runBuddyReleasePreflight(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const env = options.env ?? process.env
  const productMetadata = JSON.parse(readFileSync(
    join(cwd, 'apps/buddy/buddy.version.json'),
    'utf8',
  ))
  const releaseEnvironment = createBuddyReleaseEnvironment(
    env,
    String(productMetadata.sourceDateEpoch ?? ''),
    resolveBuddyOutputPaths(cwd).build.nativePet,
  )

  for (const step of createBuddyReleasePreflightSteps()) {
    writeOutput(`\n[Buddy] ${step.label}`)
    execFileSync(step.command, step.args, {
      cwd,
      env: releaseEnvironment,
      stdio: 'inherit',
    })
  }

  writeOutput('\nLexora Buddy preflight passed')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  runBuddyReleasePreflight()
