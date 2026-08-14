import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function createBuddyReleasePreflightSteps() {
  return [
    ['Version consistency', 'node', ['packaging/buddy/release/buddy-version.mjs', '--check']],
    ['Delivery scope', 'node', ['packaging/buddy/release/verify-delivery-scope.mjs']],
    ['Desktop assets', 'node', ['packaging/buddy/release/verify-desktop-assets.mjs']],
    ['Linux release workflow', 'node', ['packaging/buddy/release/verify-linux-release-workflow.mjs']],
    ['Desktop source lint', 'pnpm', ['exec', 'eslint', 'apps/buddy', 'packaging/buddy']],
    ['Desktop type-check', 'pnpm', ['--filter', '@lexora/buddy', 'type-check']],
    ['Desktop tests', 'pnpm', ['--filter', '@lexora/buddy', 'test']],
    ['Buddy Local Service security contracts', 'pnpm', [
      '--filter',
      '@lexora/buddy',
      'exec',
      'vitest',
      'run',
      'service/src/agent/__tests__/createBuddyResourceLoader.spec.ts',
      'service/src/connectors/mcp/__tests__/McpConnectorService.spec.ts',
      'service/src/providers/__tests__/ProviderService.spec.ts',
      'electron/main/runtime/__tests__/BuddyServiceSupervisor.spec.ts',
      'electron/main/secrets/__tests__/CredentialVault.spec.ts',
    ]],
    ['Packaging contract tests', 'pnpm', ['exec', 'vitest', 'run', 'packaging/buddy/__tests__/preflight.spec.mjs', 'packaging/buddy/__tests__/deliveryScope.spec.mjs', '--passWithNoTests']],
    ['AUR package contract', 'node', ['packaging/buddy/aur/verify-bin-package.mjs']],
    ['Native pet format', 'cargo', ['fmt', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--', '--check']],
    ['Native pet check', 'cargo', ['check', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets']],
    ['Native pet clippy', 'cargo', ['clippy', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml', '--all-targets', '--', '-D', 'warnings']],
    ['Native pet tests', 'cargo', ['test', '--manifest-path', 'apps/buddy/native-pet/Cargo.toml']],
    ['Staged whitespace', 'git', ['diff', '--cached', '--check']],
    ['Workspace whitespace', 'git', ['diff', '--check']],
    ['Electron build', 'pnpm', ['--filter', '@lexora/buddy', 'exec', 'electron-vite', 'build']],
    ['Electron bundle boundary', 'node', ['packaging/buddy/release/verify-electron-bundle.mjs']],
    ['Electron Buddy Local Service integration', 'pnpm', [
      '--filter',
      '@lexora/buddy',
      'exec',
      'vitest',
      'run',
      'electron/main/runtime/__tests__/buddyServiceProcess.integration.spec.ts',
    ]],
    ['Standalone pet package', 'pnpm', ['--filter', '@lexora/buddy', 'package:pet']],
    ['Standalone pet contract test', 'pnpm', ['exec', 'vitest', 'run', 'packaging/buddy/__tests__/petBinaryBoundary.spec.mjs', '--passWithNoTests']],
    ['Full Desktop deb package', 'node', ['packaging/buddy/release/package-desktop.mjs']],
    ['Deb Buddy Local Service dependencies', 'node', ['packaging/buddy/release/verify-deb-dependencies.mjs']],
    ['AUR release artifact', 'node', ['packaging/buddy/ci/verify-linux-deb-artifact.mjs']],
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

  writeOutput('\nLexora Desktop preflight passed')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  runBuddyReleasePreflight()
