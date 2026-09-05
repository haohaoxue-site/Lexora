import type { LocalRun } from '@buddy-electron/shared/localChatApi'
import type {
  ChatAgentTurn,
  ChatProjectionReducer,
  ChatRecoveryNotice,
  ChatRunStreamingMessage,
} from './chatStreamingMessage'
import type {
  ChatRunEventBucket,
  ChatRunEventBuckets,
} from '@/workbenches/chat/state/chatRunEventBuckets'
import {
  createChatAgentTurnReducer,
  createChatRunRecoveryNoticeReducer,
  createChatRunStreamingMessageReducer,
} from './chatStreamingMessage'

export interface ChatRunTranscriptProjection {
  recoveryNotices: ReadonlyArray<ChatRecoveryNotice>
  streamingMessages: ReadonlyArray<ChatRunStreamingMessage>
  turn: ChatAgentTurn
}

interface CachedChatRunTranscriptProjection {
  bucket: ChatRunEventBucket | null
  projection: ChatRunTranscriptProjection
  recoveryReducer: ChatProjectionReducer<ReadonlyArray<ChatRecoveryNotice>>
  run: LocalRun
  streamingReducer: ChatProjectionReducer<ReadonlyArray<ChatRunStreamingMessage>>
  turnReducer: ChatProjectionReducer<ChatAgentTurn>
}

export function createChatRunTranscriptProjector() {
  const cache = new Map<string, CachedChatRunTranscriptProjection>()

  return {
    project(
      eventBuckets: ChatRunEventBuckets,
      runs: ReadonlyArray<LocalRun>,
    ): ReadonlyArray<ChatRunTranscriptProjection> {
      const projectedRunIds = new Set<string>()
      const projections = runs.flatMap((run): ChatRunTranscriptProjection[] => {
        if (run.purpose === 'conversation.compaction')
          return []
        projectedRunIds.add(run.id)
        const bucket = eventBuckets.get(run.id) ?? null
        const cached = cache.get(run.id)
        if (cached?.run === run && cached.bucket === bucket)
          return [cached.projection]
        if (
          cached?.run === run
          && cached.bucket
          && bucket?.update?.kind === 'append'
          && bucket.update.previousRevision === cached.bucket.revision
        ) {
          const suffix = bucket.update.events
          cached.recoveryReducer.append(suffix)
          cached.streamingReducer.append(suffix)
          cached.turnReducer.append(suffix)
          const projection = projectReducers(cached)
          cache.set(run.id, { ...cached, bucket, projection })
          return [projection]
        }
        const rebuilt = rebuildRunProjection(run, bucket)
        cache.set(run.id, rebuilt)
        return [rebuilt.projection]
      })

      for (const runId of cache.keys()) {
        if (!projectedRunIds.has(runId))
          cache.delete(runId)
      }
      return projections
    },
  }
}

function rebuildRunProjection(
  run: LocalRun,
  bucket: ChatRunEventBucket | null,
): CachedChatRunTranscriptProjection {
  const recoveryReducer = createChatRunRecoveryNoticeReducer()
  const streamingReducer = createChatRunStreamingMessageReducer(run)
  const turnReducer = createChatAgentTurnReducer(run)
  const events = bucket?.events ?? []
  recoveryReducer.append(events)
  streamingReducer.append(events)
  turnReducer.append(events)
  const reducers = {
    recoveryReducer,
    streamingReducer,
    turnReducer,
  }
  return {
    bucket,
    projection: projectReducers(reducers),
    recoveryReducer,
    run,
    streamingReducer,
    turnReducer,
  }
}

function projectReducers(
  cached: Pick<
    CachedChatRunTranscriptProjection,
    'recoveryReducer' | 'streamingReducer' | 'turnReducer'
  >,
): ChatRunTranscriptProjection {
  return {
    recoveryNotices: cached.recoveryReducer.project(),
    streamingMessages: cached.streamingReducer.project(),
    turn: cached.turnReducer.project(),
  }
}
