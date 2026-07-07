import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function createBuddyReleasePreflightSteps() {
  return [
    {
      label: 'Buddy version consistency',
      command: 'node',
      args: ['packaging/buddy/release/buddy-version.mjs', '--check'],
    },
    {
      label: 'Buddy Rust tests',
      command: 'cargo',
      args: ['test', '--manifest-path', 'apps/buddy/src-tauri/Cargo.toml'],
    },
    {
      label: 'Buddy frontend tests',
      command: 'pnpm',
      args: ['--filter', '@lexora/buddy', 'test'],
    },
    {
      label: 'Buddy frontend type-check',
      command: 'pnpm',
      args: ['--filter', '@lexora/buddy', 'type-check'],
    },
    {
      label: 'Buddy delivery scope',
      command: 'node',
      args: ['packaging/buddy/release/verify-delivery-scope.mjs'],
    },
    {
      label: 'Buddy headless runtime smoke',
      command: 'cargo',
      args: ['run', '--manifest-path', 'apps/buddy/src-tauri/Cargo.toml', '--', '--buddy-health-check'],
    },
    {
      label: 'Buddy native pet runtime smoke',
      command: 'cargo',
      args: ['run', '--manifest-path', 'apps/buddy/src-tauri/Cargo.toml', '--', '--buddy-native-pet-smoke-check'],
    },
    {
      label: 'Buddy native pet drag replay smoke',
      command: 'cargo',
      args: ['run', '--manifest-path', 'apps/buddy/src-tauri/Cargo.toml', '--', '--buddy-native-pet-drag-replay-check'],
    },
    {
      label: 'Buddy Arch package',
      command: 'node',
      args: ['packaging/buddy/aur/verify-bin-package.mjs'],
    },
    {
      label: 'Buddy packaging tests',
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        'run',
        'packaging/buddy/__tests__',
        '--passWithNoTests',
      ],
    },
    {
      label: 'Workspace lint',
      command: 'pnpm',
      args: ['lint'],
    },
    {
      label: 'Workspace type-check',
      command: 'pnpm',
      args: ['type-check'],
    },
    {
      label: 'Git staged whitespace check',
      command: 'git',
      args: ['diff', '--cached', '--check'],
    },
    {
      label: 'Git workspace whitespace check',
      command: 'git',
      args: ['diff', '--check'],
    },
  ]
}

export function runBuddyReleasePreflight(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const env = options.env ?? process.env

  for (const step of createBuddyReleasePreflightSteps()) {
    writeOutput(`\n[buddy-preflight] ${step.label}`)
    execFileSync(step.command, step.args, {
      cwd,
      env,
      stdio: 'inherit',
    })
  }

  writeOutput('\nBuddy release preflight passed')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runBuddyReleasePreflight()
