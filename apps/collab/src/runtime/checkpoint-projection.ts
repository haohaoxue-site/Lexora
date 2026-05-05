import type {
  DocumentYdocCheckpointMetadata,
} from '@haohaoxue/samepage-contracts'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { DocumentYdocCurrentProjectionClient } from './ports'
import type { CollabHocuspocusDocumentState } from './update-persistence-queue'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { COLLAB_ERROR_CODE, TIPTAP_SCHEMA_VERSION } from '@haohaoxue/samepage-contracts'
import { projectTiptapDocumentCollaborationYdoc, stripDocumentAssetRuntimeAttributes } from '@haohaoxue/samepage-shared'
import * as Y from 'yjs'

/** checkpoint 后物化当前读模型的输入。 */
export interface MaterializeDocumentCurrentAfterCheckpointInput {
  documentId: string
  document: Y.Doc
  checkpointMetadata: DocumentYdocCheckpointMetadata
  currentProjectionClient: DocumentYdocCurrentProjectionClient
}

/** checkpoint 后物化当前读模型的结果。 */
export interface MaterializeDocumentCurrentAfterCheckpointResult {
  lastProjectedProjectionId: string
  lastProjectedProjectionRevision: number
}

export async function storeDocumentCheckpoint(input: {
  documentName: string
  document: Y.Doc
  documentStates: Map<string, CollabHocuspocusDocumentState>
  ydocRuntimeStore: DocumentYdocRuntimeStore
  currentProjectionClient?: DocumentYdocCurrentProjectionClient
  metrics?: CollabMetricsCollector
}): Promise<void> {
  const documentState = input.documentStates.get(input.documentName)

  if (!documentState) {
    return
  }

  await documentState.persistenceQueue

  if (documentState.persistenceFailed) {
    return
  }

  const checkpointUpdateSeq = documentState.nextUpdateSeq - 1

  if (checkpointUpdateSeq <= documentState.checkpointUpdateSeq) {
    return
  }

  try {
    const checkpointStartedAt = Date.now()
    const checkpointMetadata = await input.ydocRuntimeStore.replaceDocumentYdocCheckpoint({
      documentId: input.documentName,
      runtimeEpoch: documentState.runtimeEpoch,
      checkpointState: new Uint8Array(Y.encodeStateAsUpdate(input.document)),
      checkpointUpdateSeq,
      lastProjectedProjectionId: documentState.lastProjectedProjectionId,
      lastProjectedProjectionRevision: documentState.lastProjectedProjectionRevision,
    })
    input.metrics?.recordCheckpointDuration({
      documentId: input.documentName,
      roomId: input.documentName,
      durationMs: Date.now() - checkpointStartedAt,
    })

    documentState.runtimeEpoch = checkpointMetadata.runtimeEpoch
    documentState.nextUpdateSeq = checkpointMetadata.updateSeq + 1
    documentState.checkpointUpdateSeq = checkpointMetadata.checkpointUpdateSeq
    documentState.lastProjectedProjectionId = checkpointMetadata.lastProjectedProjectionId
    documentState.lastProjectedProjectionRevision = checkpointMetadata.lastProjectedProjectionRevision

    if (input.currentProjectionClient) {
      try {
        const projection = await materializeDocumentCurrentAfterCheckpoint({
          documentId: input.documentName,
          document: input.document,
          checkpointMetadata,
          currentProjectionClient: input.currentProjectionClient,
        })

        documentState.lastProjectedProjectionId = projection.lastProjectedProjectionId
        documentState.lastProjectedProjectionRevision = projection.lastProjectedProjectionRevision
      }
      catch {
        input.metrics?.recordCurrentProjectionFailure({
          documentId: input.documentName,
          roomId: input.documentName,
          code: 'current-projection-failed',
        })
      }
    }
  }
  catch {
    documentState.persistenceFailed = true
    input.metrics?.recordUpdatePersistenceFailure({
      documentId: input.documentName,
      roomId: input.documentName,
      code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    })
  }
}

export async function materializeDocumentCurrentAfterCheckpoint(
  input: MaterializeDocumentCurrentAfterCheckpointInput,
): Promise<MaterializeDocumentCurrentAfterCheckpointResult> {
  const content = projectTiptapDocumentCollaborationYdoc(input.document)
  const response = await input.currentProjectionClient.materializeDocumentYdocCurrentProjection(input.documentId, {
    runtimeEpoch: input.checkpointMetadata.runtimeEpoch,
    checkpointSeq: input.checkpointMetadata.checkpointSeq,
    checkpointUpdateSeq: input.checkpointMetadata.checkpointUpdateSeq,
    schemaVersion: TIPTAP_SCHEMA_VERSION,
    title: content.title,
    body: stripDocumentAssetRuntimeAttributes(content.body),
  })

  return {
    lastProjectedProjectionId: response.projection.id,
    lastProjectedProjectionRevision: response.projection.projectionRevision,
  }
}
