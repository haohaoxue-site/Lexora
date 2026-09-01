import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const sourceSteps = [
  ['Version consistency', 'node', ['packaging/release/version.mjs', '--check']],
  ['Desktop assets', 'node', ['packaging/buddy/release/verify-desktop-assets.mjs']],
  ['Release workflow', 'node', ['packaging/buddy/release/verify-release-workflow.mjs']],
  ['Desktop source lint', 'pnpm', ['exec', 'eslint', 'apps/buddy', 'packaging/buddy', 'packaging/release']],
  ['Desktop type-check', 'pnpm', ['--filter', '@lexora/buddy', 'type-check']],
  ['Desktop tests', 'pnpm', ['--filter', '@lexora/buddy', 'test']],
  ['Native pet format', 'cargo', ['fmt', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--', '--check']],
  ['Native pet check', 'cargo', ['check', '--locked', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets']],
  ['Native pet clippy', 'cargo', ['clippy', '--locked', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets', '--', '-D', 'warnings']],
  ['Native pet tests', 'cargo', ['test', '--locked', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml']],
]
const debSteps = [
  ['Ubuntu deb package', 'pnpm', ['--filter', '@lexora/buddy', 'package:deb']],
]

export function createBuddyReleasePreflightSteps(stage = 'all') {
  const steps = stage === 'all'
    ? [...sourceSteps, ...debSteps]
    : stage === 'source'
      ? sourceSteps
      : stage === 'deb'
        ? debSteps
        : undefined

  if (!steps)
    throw new Error(`Unknown Buddy preflight stage: ${stage}`)

  return steps.map(([label, command, args]) => ({ label, command, args }))
}

export function createBuddyReleaseEnvironment(
  env,
  defaultSourceDateEpoch,
  cargoTargetDirectory = resolveBuddyOutputPaths(repoRoot).build.nativePet,
) {
  const sourceDateEpoch = String(defaultSourceDateEpoch)
  if (!/^\d+$/.test(sourceDateEpoch))
    throw new Error('Buddy release SOURCE_DATE_EPOCH must be a Unix timestamp')
  if (env.SOURCE_DATE_EPOCH !== undefined && String(env.SOURCE_DATE_EPOCH) !== sourceDateEpoch)
    throw new Error('Buddy release SOURCE_DATE_EPOCH must match Buddy metadata')

  return {
    ...env,
    CARGO_TARGET_DIR: cargoTargetDirectory,
    RUSTFLAGS: env.RUSTFLAGS ?? '-D warnings',
    RUST_MIN_STACK: env.RUST_MIN_STACK ?? '16777216',
    SOURCE_DATE_EPOCH: sourceDateEpoch,
  }
}

export function runBuddyReleasePreflight(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const env = options.env ?? process.env
  const stage = options.stage ?? 'all'
  const productMetadata = JSON.parse(readFileSync(
    join(cwd, 'apps/buddy/buddy.version.json'),
    'utf8',
  ))
  const releaseEnvironment = createBuddyReleaseEnvironment(
    env,
    String(productMetadata.sourceDateEpoch ?? ''),
    resolveBuddyOutputPaths(cwd).build.nativePet,
  )

  for (const step of createBuddyReleasePreflightSteps(stage)) {
    writeOutput(`\n[Buddy] ${step.label}`)
    execFileSync(step.command, step.args, {
      cwd,
      env: releaseEnvironment,
      stdio: 'inherit',
    })
  }

  writeOutput(stage === 'source'
    ? '\nLexora Buddy source gate passed'
    : stage === 'deb'
      ? '\nLexora Buddy deb package passed'
      : '\nLexora Buddy preflight passed')
}

function readStage(args) {
  if (args.length === 0)
    return 'all'
  if (args.length === 2 && args[0] === '--stage')
    return args[1]
  throw new Error('Usage: preflight.mjs [--stage source|deb]')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  runBuddyReleasePreflight({ stage: readStage(process.argv.slice(2)) })
