import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const defaultPetPath = resolve(
  resolveBuddyOutputPaths(repoRoot).build.nativePet,
  'release/lexora-buddy-pet',
)
const agentRuntimeMarkers = [
  'chat.startTurn',
  'host.credentials.read',
  'mcp__',
  'providers.list',
  'runtime.shutdown',
  'sqlite operation failed',
]

export function verifyPetBinaryBoundary(options = {}) {
  const petPath = options.petPath ?? defaultPetPath
  const pet = readFileSync(petPath)
  const errors = []

  if (!pet.subarray(0, 4).equals(Buffer.from([0x7F, 0x45, 0x4C, 0x46])))
    errors.push('standalone pet must be an ELF executable')
  for (const marker of agentRuntimeMarkers) {
    if (pet.includes(Buffer.from(marker)))
      errors.push(`standalone pet contains Buddy Local Service marker: ${marker}`)
  }
  return errors
}

export function assertPetBinaryBoundary(options = {}) {
  const errors = verifyPetBinaryBoundary(options)
  if (errors.length)
    throw new Error(errors.join('\n'))
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertPetBinaryBoundary()
  writeOutput('Standalone pet binary boundary check passed')
}
