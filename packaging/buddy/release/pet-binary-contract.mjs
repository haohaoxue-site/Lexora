import { Buffer } from 'node:buffer'

const agentRuntimeMarkers = [
  'chat.startTurn',
  'host.credentials.read',
  'mcp__',
  'providers.list',
  'runtime.shutdown',
  'sqlite operation failed',
]

export function assertPetBinaryBoundary(pet) {
  const errors = []
  if (!pet.subarray(0, 4).equals(Buffer.from([0x7F, 0x45, 0x4C, 0x46])))
    errors.push('native pet must be an ELF executable')
  for (const marker of agentRuntimeMarkers) {
    if (pet.includes(Buffer.from(marker)))
      errors.push(`native pet contains Buddy Local Service marker: ${marker}`)
  }
  if (errors.length > 0)
    throw new Error(errors.join('\n'))
}
