import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import {
  evaluateBuddyDeliveryScope,
  formatBuddyDeliveryScopeOutput,
  parseGitPorcelainStatus,
} from './delivery-scope.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const deliveryStatusPathspecs = [
  '.github',
  '.gitignore',
  '.node-version',
  'apps/buddy',
  'eslint.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'packaging',
  'todos',
]

export function createBuddyDeliveryStatusArgs() {
  return [
    'status',
    '--short',
    '--ignored=matching',
    '--untracked-files=all',
    ...deliveryStatusPathspecs,
  ]
}

export function runBuddyDeliveryScopeCheck(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const shouldListDeliverablePaths = options.list ?? process.argv.includes('--list')
  const statusOutput = options.statusOutput ?? execFileSync('git', createBuddyDeliveryStatusArgs(), {
    cwd,
    encoding: 'utf8',
  })

  const result = evaluateBuddyDeliveryScope(parseGitPorcelainStatus(statusOutput))

  if (result.errors.length > 0)
    throw new Error(result.errors.join('\n'))

  const output = formatBuddyDeliveryScopeOutput(result, {
    list: shouldListDeliverablePaths,
  })

  writeOutput(output)

  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runBuddyDeliveryScopeCheck()
  }
  catch (error) {
    writeError(error.message)
    process.exit(1)
  }
}
