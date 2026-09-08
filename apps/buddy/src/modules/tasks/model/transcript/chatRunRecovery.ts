import type { LocalConversationTimelineItem } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun, LocalRunEvent } from '@buddy-shared/runs/runApi'

import type { ChatProjectionReducer } from './chatRunEventProjection'
import { readPayload } from './chatRunEventProjection'

export interface ChatRecoveryNotice {
  createdAt: string
  missingAttachmentCount: number
  runId: string
  sequence: number
}

export function projectChatRecoveryNotices(
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<ChatRecoveryNotice> {
  return selectChatRecoveryNotices(
    timelineItems,
    projectChatRunRecoveryNotices(events),
    runs,
  )
}

export function projectChatRunRecoveryNotices(
  events: ReadonlyArray<LocalRunEvent>,
): ReadonlyArray<ChatRecoveryNotice> {
  const reducer = createChatRunRecoveryNoticeReducer()
  reducer.append(events)
  return reducer.project()
}

export function createChatRunRecoveryNoticeReducer(): ChatProjectionReducer<ReadonlyArray<ChatRecoveryNotice>> {
  let notices: ReadonlyArray<ChatRecoveryNotice> = []

  function append(events: ReadonlyArray<LocalRunEvent>) {
    const appended = events.flatMap((event): ChatRecoveryNotice[] => {
      if (event.type !== 'session.recovery.degraded')
        return []
      const payload = readPayload(event.payload)
      const missingAttachmentCount = payload?.missingAttachmentCount
      if (
        typeof missingAttachmentCount !== 'number'
        || !Number.isSafeInteger(missingAttachmentCount)
        || missingAttachmentCount <= 0
      ) {
        return []
      }
      return [{
        createdAt: event.createdAt,
        missingAttachmentCount,
        runId: event.runId,
        sequence: event.sequence,
      }]
    })
    if (appended.length > 0)
      notices = [...notices, ...appended]
  }

  return {
    append,
    project: () => notices,
  }
}

export function selectChatRecoveryNotices(
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>,
  notices: ReadonlyArray<ChatRecoveryNotice>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<ChatRecoveryNotice> {
  const loadedMessageIds = new Set(timelineItems.flatMap(item => (
    item.kind === 'message' ? [item.id] : []
  )))
  const runById = new Map(runs.map(run => [run.id, run]))
  return notices.filter((notice) => {
    const run = runById.get(notice.runId)
    return !!run && loadedMessageIds.has(run.triggeringMessageId)
  }).sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence
  ))
}
