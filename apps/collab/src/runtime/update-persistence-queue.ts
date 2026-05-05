import type { DocumentYdocRuntimeState } from '@haohaoxue/samepage-contracts'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { CollabHocuspocusContext } from './ports'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { randomUUID } from 'node:crypto'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'

/** 单文档 Hocuspocus 持久化状态。 */
export interface CollabHocuspocusDocumentState {
  runtimeEpoch: number
  nextUpdateSeq: number
  checkpointUpdateSeq: number
  lastProjectedProjectionId: string | null
  lastProjectedProjectionRevision: number
  persistenceFailed: boolean
  persistenceQueue: Promise<void>
}

export function createDocumentState(input: {
  context: CollabHocuspocusContext
  runtimeState: DocumentYdocRuntimeState | null
}): CollabHocuspocusDocumentState {
  return {
    runtimeEpoch: input.runtimeState?.metadata.runtimeEpoch ?? input.context.runtimeEpoch ?? 1,
    nextUpdateSeq: (input.runtimeState?.metadata.updateSeq ?? 0) + 1,
    checkpointUpdateSeq: input.runtimeState?.metadata.checkpointUpdateSeq ?? 0,
    lastProjectedProjectionId: input.runtimeState?.metadata.lastProjectedProjectionId ?? null,
    lastProjectedProjectionRevision: input.runtimeState?.metadata.lastProjectedProjectionRevision ?? 0,
    persistenceFailed: false,
    persistenceQueue: Promise.resolve(),
  }
}

export function queuePersistDocumentUpdate(input: {
  documentName: string
  context: CollabHocuspocusContext
  socketId: string
  update: Uint8Array
  documentStates: Map<string, CollabHocuspocusDocumentState>
  ydocRuntimeStore: DocumentYdocRuntimeStore
  metrics?: CollabMetricsCollector
}): void {
  const documentState = input.documentStates.get(input.documentName)

  if (!documentState || documentState.persistenceFailed) {
    return
  }

  const nextSeq = documentState.nextUpdateSeq
  documentState.nextUpdateSeq += 1
  documentState.persistenceQueue = documentState.persistenceQueue
    .then(async () => {
      if (documentState.persistenceFailed) {
        return
      }

      await input.ydocRuntimeStore.persistDocumentYdocUpdate({
        documentId: input.documentName,
        runtimeEpoch: documentState.runtimeEpoch,
        seq: nextSeq,
        idempotencyKey: randomUUID(),
        clientId: input.socketId || null,
        update: new Uint8Array(input.update),
        createdBy: input.context.userId ?? null,
      })
    })
    .catch(() => {
      documentState.persistenceFailed = true
      input.metrics?.recordUpdatePersistenceFailure({
        connectionId: input.socketId || undefined,
        documentId: input.documentName,
        roomId: input.documentName,
        code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
      })
    })
}

export async function flushDocumentPersistenceQueues(
  documentStates: Map<string, CollabHocuspocusDocumentState>,
): Promise<void> {
  await Promise.all(Array.from(documentStates.values()).map(async documentState => await documentState.persistenceQueue))
}
