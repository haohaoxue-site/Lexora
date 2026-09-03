import type { BuddyRunOutputPayload } from '../../../shared/runOutput'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'
import { readRecord } from '../events/toolPresentationSupport'

export function createTrackedFileRunOutput(
  input: Pick<CreateBuddyToolPresentationInput, 'isError' | 'result' | 'toolName'> & {
    toolCallId: string
  },
): BuddyRunOutputPayload | null {
  const artifactIds = readArtifactIds(input.result)
  return artifactIds.length > 0
    ? {
        artifactIds,
        sourceToolCallId: input.toolCallId,
        sourceToolName: input.toolName,
      }
    : null
}

export function readArtifactIds(value: unknown): string[] {
  const details = readRecord(readRecord(value)?.details)
  return Array.isArray(details?.artifactIds)
    ? [...new Set(details.artifactIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256,
      ))].slice(0, 512)
    : []
}
