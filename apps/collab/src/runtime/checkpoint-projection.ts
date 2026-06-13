import type {
  DocumentYdocCheckpointMetadata,
} from '@haohaoxue/lexora-contracts'
import type { DocumentYdocCurrentProjectionClient } from '../clients/documents'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { CollabFatalPersistenceFailure, CollabRuntimeLogger } from './ports'
import type { CollabHocuspocusDocumentState } from './update-persistence-queue'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { COLLAB_ERROR_CODE, TIPTAP_SCHEMA_VERSION } from '@haohaoxue/lexora-contracts'
import { projectTiptapDocumentCollaborationYdoc, stripDocumentAssetRuntimeAttributes } from '@haohaoxue/lexora-shared'
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

  if (documentState.persistenceFailed) {
    return
  }

  const checkpointUpdateSeq = documentState.nextUpdateSeq - 1

  if (checkpointUpdateSeq <= documentState.checkpointUpdateSeq) {
    return
  }

  const checkpointState = new Uint8Array(Y.encodeStateAsUpdate(input.document))
  const checkpointTask = documentState.persistenceQueue
    .then(async (): Promise<DocumentYdocCheckpointMetadata | null> => {
      if (documentState.persistenceFailed || checkpointUpdateSeq <= documentState.checkpointUpdateSeq) {
        return null
      }

      return await persistDocumentCheckpoint({
        ...input,
        checkpointState,
        checkpointUpdateSeq,
        documentState,
      })
    })
    .catch((error: unknown): null => {
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

      return null
    })
  documentState.persistenceQueue = checkpointTask.then(() => undefined)

  const checkpointMetadata = await checkpointTask

  const currentProjectionClient = input.currentProjectionClient

  if (!checkpointMetadata || !currentProjectionClient) {
    return
  }

  documentState.projectionQueue = documentState.projectionQueue
    .then(async () => {
      await materializeCheckpointProjection({
        checkpointMetadata,
        checkpointState,
        currentProjectionClient,
        documentName: input.documentName,
        documentState,
      })
    })
    .catch((error: unknown) => {
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
    })

  await documentState.projectionQueue
}

async function persistDocumentCheckpoint(input: {
  documentName: string
  documentState: CollabHocuspocusDocumentState
  checkpointState: Uint8Array
  checkpointUpdateSeq: number
  ydocRuntimeStore: DocumentYdocRuntimeStore
  metrics?: CollabMetricsCollector
}): Promise<DocumentYdocCheckpointMetadata> {
  const checkpointStartedAt = Date.now()
  const checkpointMetadata = await input.ydocRuntimeStore.replaceDocumentYdocCheckpoint({
    documentId: input.documentName,
    runtimeEpoch: input.documentState.runtimeEpoch,
    checkpointState: input.checkpointState,
    checkpointUpdateSeq: input.checkpointUpdateSeq,
    lastProjectedProjectionId: input.documentState.lastProjectedProjectionId,
    lastProjectedProjectionRevision: input.documentState.lastProjectedProjectionRevision,
  })
  input.metrics?.recordCheckpointDuration({
    documentId: input.documentName,
    roomId: input.documentName,
    durationMs: Date.now() - checkpointStartedAt,
  })

  input.documentState.runtimeEpoch = checkpointMetadata.runtimeEpoch
  input.documentState.nextUpdateSeq = Math.max(input.documentState.nextUpdateSeq, checkpointMetadata.updateSeq + 1)
  input.documentState.checkpointUpdateSeq = checkpointMetadata.checkpointUpdateSeq
  input.documentState.lastProjectedProjectionId = checkpointMetadata.lastProjectedProjectionId
  input.documentState.lastProjectedProjectionRevision = checkpointMetadata.lastProjectedProjectionRevision

  return checkpointMetadata
}

async function materializeCheckpointProjection(input: {
  documentName: string
  documentState: CollabHocuspocusDocumentState
  checkpointState: Uint8Array
  checkpointMetadata: DocumentYdocCheckpointMetadata
  currentProjectionClient: DocumentYdocCurrentProjectionClient
}): Promise<void> {
  const checkpointDocument = createCheckpointDocument(input.checkpointState)

  try {
    const projection = await materializeDocumentCurrentAfterCheckpoint({
      documentId: input.documentName,
      document: checkpointDocument,
      checkpointMetadata: input.checkpointMetadata,
      currentProjectionClient: input.currentProjectionClient,
    })

    input.documentState.lastProjectedProjectionId = projection.lastProjectedProjectionId
    input.documentState.lastProjectedProjectionRevision = projection.lastProjectedProjectionRevision
  }
  finally {
    checkpointDocument.destroy()
  }
}

function createCheckpointDocument(checkpointState: Uint8Array): Y.Doc {
  const document = new Y.Doc()
  Y.applyUpdate(document, checkpointState)

  return document
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
