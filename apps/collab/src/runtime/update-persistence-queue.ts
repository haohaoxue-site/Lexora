import type { CollabErrorCode, DocumentYdocRuntimeState } from '@haohaoxue/samepage-contracts'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { CollabFatalPersistenceFailure, CollabHocuspocusContext, CollabRuntimeLogger } from './ports'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { randomUUID } from 'node:crypto'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'
import { sleep } from '@haohaoxue/samepage-shared'
import { isDocumentYdocRuntimeStoreError } from './ydoc-runtime-store'

const DEFAULT_UPDATE_PERSISTENCE_MAX_ATTEMPTS = 3
const DEFAULT_UPDATE_PERSISTENCE_RETRY_DELAYS_MS = [100, 500]

/** 单文档 Hocuspocus 持久化状态。 */
export interface CollabHocuspocusDocumentState {
  runtimeEpoch: number
  nextUpdateSeq: number
  checkpointUpdateSeq: number
  lastProjectedProjectionId: string | null
  lastProjectedProjectionRevision: number
  persistenceFailed: boolean
  persistenceFailureCode: CollabErrorCode | null
  persistenceQueue: Promise<void>
  projectionQueue: Promise<void>
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
    persistenceFailureCode: null,
    persistenceQueue: Promise.resolve(),
    projectionQueue: Promise.resolve(),
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
  logger?: CollabRuntimeLogger
  onFatalPersistenceFailure?: (failure: CollabFatalPersistenceFailure) => void
  persistenceRetry?: {
    maxAttempts?: number
    retryDelaysMs?: readonly number[]
  }
}): void {
  const documentState = input.documentStates.get(input.documentName)

  if (!documentState || documentState.persistenceFailed) {
    return
  }

  const pendingUpdate = createPendingDocumentUpdate({
    context: input.context,
    documentName: input.documentName,
    runtimeEpoch: documentState.runtimeEpoch,
    seq: documentState.nextUpdateSeq,
    socketId: input.socketId,
    update: input.update,
  })
  documentState.nextUpdateSeq += 1
  documentState.persistenceQueue = documentState.persistenceQueue
    .then(async () => {
      if (documentState.persistenceFailed) {
        return
      }

      await persistDocumentUpdateWithRetry({
        documentState,
        logger: input.logger,
        metrics: input.metrics,
        pendingUpdate,
        retry: resolvePersistenceRetry(input.persistenceRetry),
        ydocRuntimeStore: input.ydocRuntimeStore,
      })
    })
    .catch((error: unknown) => {
      const failure = resolvePersistenceFailure(error)
      documentState.persistenceFailed = true
      documentState.persistenceFailureCode = failure.code
      input.logger?.error(toPersistenceFailureLogContext({
        documentState,
        failure,
        pendingUpdate,
      }), 'Collab document update persistence failed')
      input.metrics?.recordUpdatePersistenceFailure({
        ...toPersistenceFailureMetricContext({
          documentState,
          failure,
          pendingUpdate,
        }),
      })
      input.onFatalPersistenceFailure?.({
        documentId: input.documentName,
        code: failure.code,
      })
    })
}

export async function flushDocumentPersistenceQueues(
  documentStates: Map<string, CollabHocuspocusDocumentState>,
): Promise<void> {
  await Promise.all(Array.from(documentStates.values()).map(async documentState => await documentState.persistenceQueue))
}

interface PendingPersistDocumentUpdate {
  documentId: string
  runtimeEpoch: number
  seq: number
  idempotencyKey: string
  clientId: string | null
  update: Uint8Array<ArrayBuffer>
  createdBy: string | null
}

interface PersistenceRetryOptions {
  maxAttempts: number
  retryDelaysMs: readonly number[]
}

interface PersistenceFailure {
  code: CollabErrorCode
  message: string
  name: string
  retryable: boolean
  cause: unknown
  attempt?: number
  maxAttempts?: number
}

function createPendingDocumentUpdate(input: {
  context: CollabHocuspocusContext
  documentName: string
  runtimeEpoch: number
  seq: number
  socketId: string
  update: Uint8Array
}): PendingPersistDocumentUpdate {
  return {
    documentId: input.documentName,
    runtimeEpoch: input.runtimeEpoch,
    seq: input.seq,
    idempotencyKey: randomUUID(),
    clientId: input.socketId || null,
    update: toArrayBufferUint8Array(input.update),
    createdBy: input.context.userId ?? null,
  }
}

async function persistDocumentUpdateWithRetry(input: {
  documentState: CollabHocuspocusDocumentState
  pendingUpdate: PendingPersistDocumentUpdate
  ydocRuntimeStore: DocumentYdocRuntimeStore
  metrics?: CollabMetricsCollector
  logger?: CollabRuntimeLogger
  retry: PersistenceRetryOptions
}): Promise<void> {
  for (let attempt = 1; attempt <= input.retry.maxAttempts; attempt += 1) {
    try {
      await input.ydocRuntimeStore.persistDocumentYdocUpdate(input.pendingUpdate)
      return
    }
    catch (error) {
      const failure = resolvePersistenceFailure(error, {
        attempt,
        maxAttempts: input.retry.maxAttempts,
      })
      const shouldRetry = failure.retryable && attempt < input.retry.maxAttempts

      if (!shouldRetry) {
        throw failure
      }

      input.logger?.warn(toPersistenceFailureLogContext({
        documentState: input.documentState,
        failure,
        pendingUpdate: input.pendingUpdate,
      }), 'Collab document update persistence retry')
      input.metrics?.recordUpdatePersistenceRetry({
        ...toPersistenceFailureMetricContext({
          documentState: input.documentState,
          failure,
          pendingUpdate: input.pendingUpdate,
        }),
        attempt,
        maxAttempts: input.retry.maxAttempts,
      })
      await sleep(input.retry.retryDelaysMs[attempt - 1] ?? 0)
    }
  }
}

function resolvePersistenceRetry(input: {
  maxAttempts?: number
  retryDelaysMs?: readonly number[]
} | undefined): PersistenceRetryOptions {
  return {
    maxAttempts: Math.max(1, input?.maxAttempts ?? DEFAULT_UPDATE_PERSISTENCE_MAX_ATTEMPTS),
    retryDelaysMs: input?.retryDelaysMs ?? DEFAULT_UPDATE_PERSISTENCE_RETRY_DELAYS_MS,
  }
}

function resolvePersistenceFailure(error: unknown, attempt?: {
  attempt: number
  maxAttempts: number
}): PersistenceFailure {
  if (isDocumentYdocRuntimeStoreError(error)) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
      retryable: error.retryable,
      cause: error.cause ?? error,
      attempt: attempt?.attempt,
      maxAttempts: attempt?.maxAttempts,
    }
  }

  if (isPersistenceFailure(error)) {
    return {
      ...error,
      attempt: error.attempt ?? attempt?.attempt,
      maxAttempts: error.maxAttempts ?? attempt?.maxAttempts,
    }
  }

  if (isRuntimeStoreErrorLike(error)) {
    return {
      code: error.code,
      message: error.message,
      name: error.name ?? 'DocumentYdocRuntimeStoreError',
      retryable: error.retryable,
      cause: error.cause ?? error,
      attempt: attempt?.attempt,
      maxAttempts: attempt?.maxAttempts,
    }
  }

  if (error instanceof Error) {
    return {
      code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
      message: error.message || COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
      name: error.name || 'Error',
      retryable: true,
      cause: error,
      attempt: attempt?.attempt,
      maxAttempts: attempt?.maxAttempts,
    }
  }

  return {
    code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    message: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    name: 'UnknownPersistenceError',
    retryable: true,
    cause: error,
    attempt: attempt?.attempt,
    maxAttempts: attempt?.maxAttempts,
  }
}

function isPersistenceFailure(error: unknown): error is PersistenceFailure {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && 'retryable' in error
    && 'message' in error,
  )
}

function isRuntimeStoreErrorLike(error: unknown): error is {
  code: CollabErrorCode
  message: string
  name?: string
  retryable: boolean
  cause?: unknown
} {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && 'message' in error
    && 'retryable' in error,
  )
}

function toPersistenceFailureLogContext(input: {
  documentState: CollabHocuspocusDocumentState
  failure: PersistenceFailure
  pendingUpdate: PendingPersistDocumentUpdate
}): Record<string, unknown> {
  return {
    code: input.failure.code,
    retryable: input.failure.retryable,
    documentId: input.pendingUpdate.documentId,
    runtimeEpoch: input.pendingUpdate.runtimeEpoch,
    seq: input.pendingUpdate.seq,
    checkpointUpdateSeq: input.documentState.checkpointUpdateSeq,
    idempotencyKey: input.pendingUpdate.idempotencyKey,
    connectionId: input.pendingUpdate.clientId ?? undefined,
    userId: input.pendingUpdate.createdBy ?? undefined,
    attempt: input.failure.attempt,
    maxAttempts: input.failure.maxAttempts,
    err: input.failure.cause instanceof Error ? input.failure.cause : undefined,
    errorName: input.failure.name,
    errorMessage: input.failure.message,
  }
}

function toPersistenceFailureMetricContext(input: {
  documentState: CollabHocuspocusDocumentState
  failure: PersistenceFailure
  pendingUpdate: PendingPersistDocumentUpdate
}) {
  return {
    code: input.failure.code,
    connectionId: input.pendingUpdate.clientId ?? undefined,
    documentId: input.pendingUpdate.documentId,
    roomId: input.pendingUpdate.documentId,
    runtimeEpoch: input.pendingUpdate.runtimeEpoch,
    seq: input.pendingUpdate.seq,
    checkpointUpdateSeq: input.documentState.checkpointUpdateSeq,
    idempotencyKey: input.pendingUpdate.idempotencyKey,
    attempt: input.failure.attempt,
    maxAttempts: input.failure.maxAttempts,
    retryable: input.failure.retryable,
    errorName: input.failure.name,
    errorMessage: input.failure.message,
  }
}

function toArrayBufferUint8Array(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(payload)
}
