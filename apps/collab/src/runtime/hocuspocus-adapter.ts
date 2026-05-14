import type { CollabHocuspocusRuntime, CreateHocuspocusRuntimeInput } from './ports'
import type { CollabHocuspocusDocumentState } from './update-persistence-queue'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'
import { Hocuspocus as HocuspocusServer } from '@hocuspocus/server'
import { assertCollabUpdateSize } from '../gateway/limits'
import { applyCollabConnectionAuthorization } from './authorization'
import { storeDocumentCheckpoint } from './checkpoint-projection'
import { loadDocumentYdocFromRuntimeStore, restoreDocumentYdocFromRuntimeStore } from './document-loader'
import {
  createDocumentState,
  flushDocumentPersistenceQueues,
  queuePersistDocumentUpdate,
} from './update-persistence-queue'
import { createEmptyDocumentYdocRuntimeStore } from './ydoc-runtime-store'

/** Hocuspocus update 大小断言输入。 */
export interface AssertIncomingHocuspocusUpdateSizeInput {
  update: Uint8Array
  maxUpdateBytes: number
}

export function createHocuspocusRuntime(input: CreateHocuspocusRuntimeInput = {}): CollabHocuspocusRuntime {
  const ydocRuntimeStore = input.ydocRuntimeStore ?? createEmptyDocumentYdocRuntimeStore()
  const maxUpdateBytes = input.maxUpdateBytes ?? 1024 * 1024
  const documentStates = new Map<string, CollabHocuspocusDocumentState>()

  const server = new HocuspocusServer({
    name: 'samepage-collab',
    quiet: true,
    debounce: 1_000,
    maxDebounce: 10_000,
    unloadImmediately: false,
    async onConnect(data) {
      applyCollabConnectionAuthorization({
        documentName: data.documentName,
        context: data.context,
        connectionConfig: data.connectionConfig,
      })
    },
    async onLoadDocument(data) {
      const restored = await loadDocumentYdocFromRuntimeStore(data.documentName, ydocRuntimeStore)

      documentStates.set(data.documentName, createDocumentState({
        context: data.context,
        runtimeState: restored.runtimeState,
      }))
      input.metrics?.recordRoomLoaded({
        roomId: data.documentName,
        documentId: data.documentName,
      })

      return restored.document
    },
    async beforeHandleMessage(data) {
      assertIncomingHocuspocusUpdateSize({
        update: data.update,
        maxUpdateBytes,
      })

      if (data.context.canWrite && documentStates.get(data.documentName)?.persistenceFailed) {
        throw new Error(documentStates.get(data.documentName)?.persistenceFailureCode ?? COLLAB_ERROR_CODE.PERSISTENCE_FAILED)
      }
    },
    async onChange(data) {
      queuePersistDocumentUpdate({
        documentName: data.documentName,
        context: data.context,
        socketId: data.socketId,
        update: data.update,
        documentStates,
        ydocRuntimeStore,
        metrics: input.metrics,
        logger: input.logger,
        onFatalPersistenceFailure: input.onFatalPersistenceFailure,
      })
    },
    async onStoreDocument(data) {
      await storeDocumentCheckpoint({
        documentName: data.documentName,
        document: data.document,
        documentStates,
        ydocRuntimeStore,
        currentProjectionClient: input.currentProjectionClient,
        metrics: input.metrics,
        logger: input.logger,
        onFatalPersistenceFailure: input.onFatalPersistenceFailure,
      })
    },
    async afterUnloadDocument(data) {
      const documentState = documentStates.get(data.documentName)
      await documentState?.persistenceQueue
      documentStates.delete(data.documentName)
      input.metrics?.recordRoomUnloaded({
        roomId: data.documentName,
        documentId: data.documentName,
      })
    },
  })

  return Object.assign(server, {
    async flushPersistenceQueues() {
      await flushDocumentPersistenceQueues(documentStates)
    },
  })
}

export function assertIncomingHocuspocusUpdateSize(input: AssertIncomingHocuspocusUpdateSizeInput): void {
  assertCollabUpdateSize(input)
}

export { materializeDocumentCurrentAfterCheckpoint } from './checkpoint-projection'
export { restoreDocumentYdocFromRuntimeStore }
