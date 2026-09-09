import type { BuddyRunEvent } from '../events/BuddyRunEvent'
import type { ArtifactRecord } from '../storage/artifactRepository'
import { buddyRunOutputPayloadSchema } from '../../../shared/runs/runOutput'

export function projectRunOutputs(
  events: readonly Pick<BuddyRunEvent, 'type' | 'payload' | 'runId' | 'createdAt'>[],
  artifacts: readonly ArtifactRecord[],
) {
  const artifactsById = new Map(artifacts.map(record => [record.id, record]))
  return events.flatMap((event) => {
    if (event.type !== 'output.produced')
      return []
    const output = buddyRunOutputPayloadSchema.safeParse(event.payload)
    if (!output.success)
      return []
    const projectedArtifacts = [...new Set(output.data.artifactIds)].flatMap((artifactId) => {
      const artifact = artifactsById.get(artifactId)
      return artifact
        ? [toPublicArtifact(artifact, event.runId, output.data.sourceToolCallId)]
        : []
    })
    return projectedArtifacts.length > 0
      ? [{
          artifacts: projectedArtifacts,
          createdAt: event.createdAt,
          runId: event.runId,
          sourceToolCallId: output.data.sourceToolCallId,
        }]
      : []
  })
}

function toPublicArtifact(
  record: ArtifactRecord,
  runId: string,
  sourceToolCallId: string,
) {
  return {
    artifactId: record.id,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    kind: record.kind,
    mimeType: record.mimeType,
    name: record.name,
    path: record.currentPath,
    previewUrl: null,
    runId,
    sizeBytes: record.sizeBytes,
    sourceArtifactId: record.sourceArtifactId,
    sourceToolCallId,
    updatedAt: record.updatedAt,
  }
}
