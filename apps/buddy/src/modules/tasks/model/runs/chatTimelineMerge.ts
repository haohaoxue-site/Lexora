import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalConversationTimelineItem, LocalConversationTimelinePage } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun, LocalRunEvent, LocalRunOutput } from '@buddy-shared/runs/runApi'

import type { ChatRunEventBuckets } from './typing'
import { compactChatRunEventSnapshots, mergeChatRunEvents } from './chatRunEventBuckets'

export function mergeConversationTimelinePages(
  newer: LocalConversationTimelinePage,
  older: LocalConversationTimelinePage,
): LocalConversationTimelinePage {
  return {
    changeSets: mergeChangeSets(older.changeSets, newer.changeSets),
    items: mergeOlderTimelineItems(newer.items, older.items),
    nextCursor: older.nextCursor,
    outputs: mergeRunOutputs(older.outputs, newer.outputs),
    runEvents: mergeTimelineEvents(older.runEvents, newer.runEvents, newer.runs),
    runs: [...new Map([...older.runs, ...newer.runs].map(run => [run.id, run])).values()],
  }
}

export function mergeChangeSets(
  current: ReadonlyArray<LocalChangeSetSummary>,
  incoming: ReadonlyArray<LocalChangeSetSummary>,
): ReadonlyArray<LocalChangeSetSummary> {
  const byId = new Map(current.map(changeSet => [changeSet.changeSetId, changeSet]))
  for (const changeSet of incoming)
    byId.set(changeSet.changeSetId, changeSet)
  return [...byId.values()].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
}

export function mergeRunOutputs(
  current: ReadonlyArray<LocalRunOutput>,
  incoming: ReadonlyArray<LocalRunOutput>,
): ReadonlyArray<LocalRunOutput> {
  const byId = new Map(current.map(output => [
    `${output.runId}:${output.sourceToolCallId}`,
    output,
  ]))
  for (const output of incoming)
    byId.set(`${output.runId}:${output.sourceToolCallId}`, output)
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function mergeTailTimelineItems(
  current: ReadonlyArray<LocalConversationTimelineItem>,
  incoming: ReadonlyArray<LocalConversationTimelineItem>,
): ReadonlyArray<LocalConversationTimelineItem> {
  const incomingById = new Map(incoming.map(item => [timelineItemKey(item), item]))
  const currentIds = new Set(current.map(timelineItemKey))
  return [
    ...current.map(item => incomingById.get(timelineItemKey(item)) ?? item),
    ...incoming.filter(item => !currentIds.has(timelineItemKey(item))),
  ]
}

export function mergeOlderTimelineItems(
  current: ReadonlyArray<LocalConversationTimelineItem>,
  incoming: ReadonlyArray<LocalConversationTimelineItem>,
): ReadonlyArray<LocalConversationTimelineItem> {
  const currentIds = new Set(current.map(timelineItemKey))
  return [
    ...incoming.filter(item => !currentIds.has(timelineItemKey(item))),
    ...current,
  ]
}

export function timelineItemKey(item: LocalConversationTimelineItem): string {
  return `${item.kind}:${item.id}`
}

export function mergeTimelineEvents(
  current: ReadonlyArray<LocalRunEvent>,
  incoming: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<LocalRunEvent> {
  const terminalRunIds = new Set(runs.flatMap(run => (
    run.status === 'queued' || run.status === 'running' ? [] : [run.id]
  )))
  return compactChatRunEventSnapshots(
    mergeChatRunEvents(
      current.filter(event => !terminalRunIds.has(event.runId)),
      incoming,
    ),
  )
}

export function flattenRunEventBuckets(
  buckets: ChatRunEventBuckets,
): ReadonlyArray<LocalRunEvent> {
  return [...buckets.values()].flatMap(bucket => bucket.events)
}

export function isRunSignalEvent(event: LocalRunEvent): boolean {
  if (
    event.type === 'context.compaction.completed'
    || event.type === 'context.usage.updated'
  ) {
    return true
  }
  if (event.type !== 'tool.started')
    return false
  const presentation = event.payload.presentation
  return Boolean(
    presentation
    && typeof presentation === 'object'
    && 'card' in presentation
    && presentation.card === 'browser'
    && 'operation' in presentation
    && presentation.operation === 'open',
  )
}
