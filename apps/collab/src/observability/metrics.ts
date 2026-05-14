type CollabMetricEventType
  = | 'checkpoint-duration'
    | 'connection-closed'
    | 'connection-opened'
    | 'room-loaded'
    | 'room-unloaded'
    | 'current-projection-failed'
    | 'update-persistence-failed'
    | 'update-persistence-retry'

/** 协作指标事件上下文。 */
export interface CollabMetricEventContext {
  requestId?: string
  connectionId?: string
  documentId?: string
  roomId?: string
  code?: string
  runtimeEpoch?: number
  seq?: number
  checkpointUpdateSeq?: number
  idempotencyKey?: string
  attempt?: number
  maxAttempts?: number
  retryable?: boolean
  errorName?: string
  errorMessage?: string
}

/** 协作指标事件。 */
export interface CollabMetricEvent extends CollabMetricEventContext {
  type: CollabMetricEventType
  durationMs?: number
}

/** 协作指标快照。 */
export interface CollabMetricsSnapshot {
  activeConnections: number
  documentRooms: number
  updatePersistenceFailures: number
  updatePersistenceRetries: number
  currentProjectionFailures: number
  checkpointDurationMs: {
    count: number
    average: number
    max: number
  }
  events: CollabMetricEvent[]
}

/** 协作指标收集器。 */
export interface CollabMetricsCollector {
  recordConnectionOpened: (context: Required<Pick<CollabMetricEventContext, 'connectionId' | 'documentId'>> & Pick<CollabMetricEventContext, 'requestId'>) => void
  recordConnectionClosed: (context: Required<Pick<CollabMetricEventContext, 'connectionId' | 'documentId'>> & Pick<CollabMetricEventContext, 'requestId'>) => void
  recordRoomLoaded: (context: Required<Pick<CollabMetricEventContext, 'documentId' | 'roomId'>>) => void
  recordRoomUnloaded: (context: Required<Pick<CollabMetricEventContext, 'documentId' | 'roomId'>>) => void
  recordUpdatePersistenceFailure: (context: Required<Pick<CollabMetricEventContext, 'code' | 'documentId' | 'roomId'>> & CollabMetricEventContext) => void
  recordUpdatePersistenceRetry: (context: Required<Pick<CollabMetricEventContext, 'attempt' | 'code' | 'documentId' | 'maxAttempts' | 'roomId'>> & CollabMetricEventContext) => void
  recordCurrentProjectionFailure: (context: Required<Pick<CollabMetricEventContext, 'code' | 'documentId' | 'roomId'>> & Pick<CollabMetricEventContext, 'connectionId' | 'requestId'>) => void
  recordCheckpointDuration: (context: Required<Pick<CollabMetricEventContext, 'documentId' | 'roomId'>> & { durationMs: number }) => void
  getSnapshot: () => CollabMetricsSnapshot
}

const MAX_EVENTS = 100

export function createCollabMetricsCollector(): CollabMetricsCollector {
  const activeConnections = new Set<string>()
  const documentRooms = new Set<string>()
  const events: CollabMetricEvent[] = []
  let updatePersistenceFailures = 0
  let updatePersistenceRetries = 0
  let currentProjectionFailures = 0
  let checkpointDurationCount = 0
  let checkpointDurationTotal = 0
  let checkpointDurationMax = 0

  return {
    recordConnectionOpened(context) {
      activeConnections.add(context.connectionId)
      pushEvent(events, {
        type: 'connection-opened',
        ...sanitizeContext(context),
      })
    },

    recordConnectionClosed(context) {
      activeConnections.delete(context.connectionId)
      pushEvent(events, {
        type: 'connection-closed',
        ...sanitizeContext(context),
      })
    },

    recordRoomLoaded(context) {
      documentRooms.add(context.roomId)
      pushEvent(events, {
        type: 'room-loaded',
        ...sanitizeContext(context),
      })
    },

    recordRoomUnloaded(context) {
      documentRooms.delete(context.roomId)
      pushEvent(events, {
        type: 'room-unloaded',
        ...sanitizeContext(context),
      })
    },

    recordUpdatePersistenceFailure(context) {
      updatePersistenceFailures += 1
      pushEvent(events, {
        type: 'update-persistence-failed',
        ...sanitizeContext(context),
      })
    },

    recordUpdatePersistenceRetry(context) {
      updatePersistenceRetries += 1
      pushEvent(events, {
        type: 'update-persistence-retry',
        ...sanitizeContext(context),
      })
    },

    recordCurrentProjectionFailure(context) {
      currentProjectionFailures += 1
      pushEvent(events, {
        type: 'current-projection-failed',
        ...sanitizeContext(context),
      })
    },

    recordCheckpointDuration(context) {
      checkpointDurationCount += 1
      checkpointDurationTotal += context.durationMs
      checkpointDurationMax = Math.max(checkpointDurationMax, context.durationMs)
      pushEvent(events, {
        type: 'checkpoint-duration',
        ...sanitizeContext(context),
        durationMs: context.durationMs,
      })
    },

    getSnapshot() {
      return {
        activeConnections: activeConnections.size,
        documentRooms: documentRooms.size,
        updatePersistenceFailures,
        updatePersistenceRetries,
        currentProjectionFailures,
        checkpointDurationMs: {
          count: checkpointDurationCount,
          average: checkpointDurationCount === 0 ? 0 : checkpointDurationTotal / checkpointDurationCount,
          max: checkpointDurationMax,
        },
        events: [...events],
      }
    },
  }
}

function pushEvent(events: CollabMetricEvent[], event: CollabMetricEvent): void {
  events.push(event)

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }
}

function sanitizeContext(context: CollabMetricEventContext): CollabMetricEventContext {
  return {
    requestId: context.requestId,
    connectionId: context.connectionId,
    documentId: context.documentId,
    roomId: context.roomId,
    code: context.code,
    runtimeEpoch: context.runtimeEpoch,
    seq: context.seq,
    checkpointUpdateSeq: context.checkpointUpdateSeq,
    idempotencyKey: context.idempotencyKey,
    attempt: context.attempt,
    maxAttempts: context.maxAttempts,
    retryable: context.retryable,
    errorName: context.errorName,
    errorMessage: context.errorMessage,
  }
}
