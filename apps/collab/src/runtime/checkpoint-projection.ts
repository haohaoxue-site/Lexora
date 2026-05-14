import type {
  DocumentYdocCheckpointMetadata,
} from '@haohaoxue/samepage-contracts'
import type { DocumentYdocCurrentProjectionClient } from '../clients/documents'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { CollabFatalPersistenceFailure, CollabRuntimeLogger } from './ports'
import type { CollabHocuspocusDocumentState } from './update-persistence-queue'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { COLLAB_ERROR_CODE, TIPTAP_SCHEMA_VERSION } from '@haohaoxue/samepage-contracts'
import { projectTiptapDocumentCollaborationYdoc, stripDocumentAssetRuntimeAttributes } from '@haohaoxue/samepage-shared'
import * as Y from 'yjs'
import { isDocumentYdocRuntimeStoreError } from './ydoc-runtime-store'

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
  logger?: CollabRuntimeLogger
  onFatalPersistenceFailure?: (failure: CollabFatalPersistenceFailure) => void
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
      catch (error) {
        input.logger?.error({
          code: 'current-projection-failed',
          documentId: input.documentName,
          roomId: input.documentName,
          runtimeEpoch: checkpointMetadata.runtimeEpoch,
          checkpointUpdateSeq: checkpointMetadata.checkpointUpdateSeq,
          err: error instanceof Error ? error : undefined,
          errorName: error instanceof Error ? error.name : 'UnknownProjectionError',
          errorMessage: error instanceof Error ? error.message : 'current-projection-failed',
        }, 'Collab document current projection failed')
        input.metrics?.recordCurrentProjectionFailure({
          documentId: input.documentName,
          roomId: input.documentName,
          code: 'current-projection-failed',
        })
      }
    }
  }
  catch (error) {
    const code = isDocumentYdocRuntimeStoreError(error)
      ? error.code
      : COLLAB_ERROR_CODE.PERSISTENCE_FAILED
    documentState.persistenceFailed = true
    documentState.persistenceFailureCode = code
    input.logger?.error({
      code,
      documentId: input.documentName,
      roomId: input.documentName,
      runtimeEpoch: documentState.runtimeEpoch,
      checkpointUpdateSeq,
      err: error instanceof Error ? error : undefined,
      errorName: error instanceof Error ? error.name : 'UnknownCheckpointError',
      errorMessage: error instanceof Error ? error.message : COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    }, 'Collab document checkpoint persistence failed')
    input.metrics?.recordUpdatePersistenceFailure({
      documentId: input.documentName,
      roomId: input.documentName,
      code,
      runtimeEpoch: documentState.runtimeEpoch,
      checkpointUpdateSeq,
      retryable: isDocumentYdocRuntimeStoreError(error) ? error.retryable : undefined,
      errorName: error instanceof Error ? error.name : 'UnknownCheckpointError',
      errorMessage: error instanceof Error ? error.message : COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    })
    input.onFatalPersistenceFailure?.({
      documentId: input.documentName,
      code,
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
