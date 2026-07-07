import type {
  BuddyChatMessageViewRow,
  BuddyChatMessageViewRowCache,
} from '@/chat/chatMessageView'
import type {
  BuddyChatRunActivityKind,
  BuddyChatRunActivityRow,
} from '@/chat/chatTranscriptEventView'
import type { BuddyTranslate } from '@/i18n/buddyI18n'
import type { BuddyChatRunEvent, BuddyMessage } from '@/lib/tauriRuntime'
import { createChatMessageViewRows } from '@/chat/chatMessageView'
import {
  createChatRunActivityRows,
  normalizeRunEventPayload,
  readPayloadString,
  stripBuddyAnimationIntentBlocks,
} from '@/chat/chatTranscriptEventView'
import { compactRunEventText } from '@/lib/runEventPayload'

const MERGED_ACTIVITY_OUTPUT_PREVIEW_CHARS = 12000
const MERGED_ACTIVITY_SUMMARY_PREVIEW_CHARS = 1600

export type BuddyChatTranscriptRow
  = | BuddyChatTranscriptActivityRow
    | BuddyChatTranscriptMessageRow
    | BuddyChatTranscriptReferencesRow
    | BuddyChatTranscriptRunDetailsRow
    | BuddyChatTranscriptRunRow

export interface BuddyChatTranscriptMessageRow extends BuddyChatMessageViewRow {
  flow: 'final' | 'process'
  key: string
  runId: string | null
  type: 'message'
}

export interface BuddyChatTranscriptActivityRow extends BuddyChatRunActivityRow {
  createdAt: string
  itemCount?: number
  key: string
  runId: string
  type: 'activity'
}

type BuddyChatTranscriptProcessRow = BuddyChatTranscriptActivityRow | BuddyChatTranscriptMessageRow

export interface BuddyChatTranscriptRunRow {
  collapsedAssistantMessage: BuddyChatTranscriptMessageRow | null
  key: string
  label: string
  runId: string
  status: 'cancelled' | 'completed' | 'failed' | 'running'
  summary: string
  type: 'run'
}

export interface BuddyChatTranscriptReferencesRow {
  defaultOpen: boolean
  items: ReadonlyArray<BuddyChatTranscriptReferencesItem>
  key: string
  runId: string
  summaryLabel: string
  title: string
  type: 'references'
}

export interface BuddyChatTranscriptReferencesItem {
  kind: 'codex' | 'memory' | 'meta'
  key: string
  body: string
  detail: string
  label: string
  summary: string
}

export interface BuddyChatTranscriptRunDetailsRow {
  defaultOpen: boolean
  details: ReadonlyArray<BuddyChatTranscriptRunDetail>
  key: string
  runId: string
  summary: string
  summaryLabel: string
  type: 'run-details'
}

export interface BuddyChatTranscriptRunDetail {
  kind: BuddyChatRunActivityKind
  label: string
  status: BuddyChatRunActivityRow['status']
  summary: string
}

export interface BuddyChatRunEventGroup {
  assistantMessageId: string | null
  hasDeltaMessageRows: boolean
  hasPersistedAssistantMessage: boolean
  processRows: ReadonlyArray<BuddyChatTranscriptProcessRow>
  references: BuddyChatTranscriptReferencesRow | null
  run: BuddyChatTranscriptRunRow
  runId: string
  userMessageId: string | null
}

interface CreateChatTranscriptRowsOptions {
  cacheKeySalt?: string
  messageRowCache?: BuddyChatMessageViewRowCache
  runGroupCache?: BuddyChatTranscriptRunGroupCache
}

export interface BuddyChatTranscriptRunGroupCache {
  get: (input: BuddyChatTranscriptRunGroupCacheInput) => BuddyChatRunEventGroup
}

export interface BuddyChatTranscriptRunGroupCacheInput {
  cacheKeySalt: string
  messageIds: ReadonlySet<string>
  messagesById: ReadonlyMap<string, BuddyChatMessageViewRow>
  runId: string
  sortedEvents: ReadonlyArray<BuddyChatRunEvent>
  t: BuddyTranslate
}

export function createChatTranscriptRows(
  messages: ReadonlyArray<BuddyMessage>,
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
  options: CreateChatTranscriptRowsOptions = {},
): ReadonlyArray<BuddyChatTranscriptRow> {
  const messageRows = createChatMessageViewRows(messages, t, {
    cache: options.messageRowCache,
  })
  const messagesById = new Map(messageRows.map(message => [message.id, message]))
  const messageIds = new Set(messagesById.keys())
  const runGroups = createRunEventGroups(events, messageIds, messagesById, t, {
    cacheKeySalt: options.cacheKeySalt ?? '',
    runGroupCache: options.runGroupCache,
  })
  const runsByUserMessageId = groupRunsByMessageId(runGroups, 'userMessageId')
  const runsByAssistantMessageId = groupRunsByMessageId(runGroups, 'assistantMessageId')
  const usedRunIds = new Set<string>()
  const rows: BuddyChatTranscriptRow[] = []

  for (const message of messageRows) {
    const assistantRunGroups = message.role === 'assistant'
      ? runsByAssistantMessageId.get(message.id) ?? []
      : []
    if (message.role === 'assistant') {
      appendAssistantRunPrelude(rows, assistantRunGroups, usedRunIds)
    }

    if (
      message.role !== 'assistant'
      || !shouldSkipPersistedAssistantMessage(assistantRunGroups, usedRunIds)
    ) {
      rows.push({
        ...message,
        flow: 'final',
        key: `message-${message.id}`,
        runId: null,
        type: 'message',
      })
    }

    if (message.role === 'assistant') {
      appendRunTailRows(rows, assistantRunGroups, usedRunIds)
    }

    if (message.role === 'user') {
      appendPendingRunGroups(rows, runsByUserMessageId.get(message.id) ?? [], usedRunIds)
    }
  }

  appendPendingRunGroups(
    rows,
    runGroups.filter(group => !usedRunIds.has(group.runId)),
    usedRunIds,
  )

  return rows
}

export function createChatTranscriptRunGroupCache(
  maxSize = 160,
): BuddyChatTranscriptRunGroupCache {
  const groups = new Map<string, BuddyChatRunEventGroup>()

  return {
    get(input) {
      const key = createRunEventGroupCacheKey(input)
      const cached = groups.get(key)
      if (cached) {
        groups.delete(key)
        groups.set(key, cached)

        return cached
      }

      const group = createRunEventGroup(input)
      groups.set(key, group)
      pruneMapToSize(groups, maxSize)

      return group
    },
  }
}

export function createVisibleChatTranscriptRows(
  rows: ReadonlyArray<BuddyChatTranscriptRow>,
  collapsedRunIds: ReadonlySet<string>,
): ReadonlyArray<BuddyChatTranscriptRow> {
  const visibleRows: BuddyChatTranscriptRow[] = []

  for (const row of rows) {
    if (!isChatTranscriptRowVisible(row, collapsedRunIds))
      continue

    visibleRows.push(row)
    if (row.type === 'run' && collapsedRunIds.has(row.runId) && row.collapsedAssistantMessage)
      visibleRows.push(row.collapsedAssistantMessage)
  }

  return visibleRows
}

function isChatTranscriptRowVisible(
  row: BuddyChatTranscriptRow,
  collapsedRunIds: ReadonlySet<string>,
): boolean {
  if (row.type === 'message' && row.runId)
    return !collapsedRunIds.has(row.runId)

  if (row.type === 'activity' || row.type === 'run-details')
    return !collapsedRunIds.has(row.runId)

  return true
}

function createRunEventGroups(
  events: ReadonlyArray<BuddyChatRunEvent>,
  messageIds: ReadonlySet<string>,
  messagesById: ReadonlyMap<string, BuddyChatMessageViewRow>,
  t: BuddyTranslate,
  options: {
    cacheKeySalt: string
    runGroupCache?: BuddyChatTranscriptRunGroupCache
  },
): ReadonlyArray<BuddyChatRunEventGroup> {
  const eventsByRunId = new Map<string, BuddyChatRunEvent[]>()
  for (const event of events) {
    const runEvents = eventsByRunId.get(event.runId) ?? []
    runEvents.push(event)
    eventsByRunId.set(event.runId, runEvents)
  }

  return [...eventsByRunId.entries()]
    .map(([runId, runEvents]) => {
      const sortedEvents = runEvents.slice().sort((first, second) => first.id - second.id)
      const input = {
        cacheKeySalt: options.cacheKeySalt,
        messageIds,
        messagesById,
        runId,
        sortedEvents,
        t,
      }

      return options.runGroupCache?.get(input) ?? createRunEventGroup(input)
    })
    .sort((first, second) =>
      resolveGroupFirstEventId(eventsByRunId.get(first.runId) ?? [])
      - resolveGroupFirstEventId(eventsByRunId.get(second.runId) ?? []),
    )
}

function createRunEventGroup(
  input: BuddyChatTranscriptRunGroupCacheInput,
): BuddyChatRunEventGroup {
  const { messagesById, messageIds, runId, sortedEvents, t } = input
  const assistantMessageId = resolveRunAssistantMessageId(sortedEvents)
  const hasPersistedAssistantMessage = assistantMessageId
    ? messageIds.has(assistantMessageId)
    : false
  const finalStreamItemId = resolveFinalAssistantMessageItemId(sortedEvents)
  const processRows = createTranscriptProcessRows(runId, sortedEvents, finalStreamItemId, t)
  const hasDeltaMessageRows = processRows.some(row => row.type === 'message')
  const collapsedAssistantMessage = hasDeltaMessageRows
    ? createCollapsedAssistantMessage(
        runId,
        sortedEvents,
        assistantMessageId ? messagesById.get(assistantMessageId) : undefined,
        t,
      )
    : null

  return {
    assistantMessageId,
    hasDeltaMessageRows,
    hasPersistedAssistantMessage,
    processRows,
    references: createTranscriptReferencesRow(runId, sortedEvents, t),
    run: createTranscriptRunRow(runId, sortedEvents, collapsedAssistantMessage, t),
    runId,
    userMessageId: resolveRunUserMessageId(sortedEvents),
  }
}

function createRunEventGroupCacheKey(input: BuddyChatTranscriptRunGroupCacheInput) {
  const { cacheKeySalt, messageIds, messagesById, runId, sortedEvents } = input
  const firstEvent = sortedEvents[0]
  const lastEvent = sortedEvents[sortedEvents.length - 1]
  const assistantMessageId = resolveRunAssistantMessageId(sortedEvents)
  const assistantMessage = assistantMessageId ? messagesById.get(assistantMessageId) : undefined

  return [
    cacheKeySalt,
    runId,
    sortedEvents.length,
    firstEvent?.id ?? '',
    lastEvent?.id ?? '',
    lastEvent?.eventType ?? '',
    messageIds.size,
    resolveRunUserMessageId(sortedEvents) ?? '',
    assistantMessageId ?? '',
    assistantMessage ? 1 : 0,
    assistantMessage?.content.length ?? 0,
    assistantMessage?.createdAt ?? '',
    resolveFinalAssistantMessageItemId(sortedEvents) ?? '',
  ].join('\u001F')
}

function pruneMapToSize<TKey, TValue>(map: Map<TKey, TValue>, maxSize: number) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value
    if (firstKey === undefined)
      break

    map.delete(firstKey)
  }
}

interface OrderedTranscriptProcessRow {
  order: number
  row: BuddyChatTranscriptProcessRow
}

function createTranscriptProcessRows(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  finalStreamItemId: string | null,
  t: BuddyTranslate,
): ReadonlyArray<BuddyChatTranscriptProcessRow> {
  const activityEvents = events.filter(event =>
    event.eventType !== 'message.delta'
    && event.eventType !== 'message.completed',
  )
  const orderedRows = [
    ...createOrderedTranscriptActivityRows(runId, activityEvents, t),
    ...createOrderedTranscriptStreamMessageRows(runId, events, finalStreamItemId, t),
  ].sort((first, second) => first.order - second.order)

  return mergeAdjacentActivityRows(orderedRows).map(item => item.row)
}

function createOrderedTranscriptActivityRows(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): ReadonlyArray<OrderedTranscriptProcessRow> {
  const eventsByItemId = new Map<string, BuddyChatRunEvent[]>()
  for (const event of events) {
    const itemId = resolveEventItemId(event)
    if (!itemId)
      continue

    const itemEvents = eventsByItemId.get(itemId) ?? []
    itemEvents.push(event)
    eventsByItemId.set(itemId, itemEvents)
  }

  return createChatRunActivityRows(events, t).map((row, index) => {
    const itemEvents = eventsByItemId.get(row.id) ?? []
    const firstEvent = itemEvents[0] ?? events[0]

    return {
      order: firstEvent?.id ?? index,
      row: {
        ...row,
        createdAt: firstEvent?.createdAt ?? '',
        key: `activity-${runId}-${row.id}`,
        runId,
        type: 'activity',
      },
    }
  })
}

function createOrderedTranscriptStreamMessageRows(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  finalStreamItemId: string | null,
  t: BuddyTranslate,
): ReadonlyArray<OrderedTranscriptProcessRow> {
  const streams = new Map<string, {
    content: string
    createdAt: string
    order: number
    phase: AssistantMessagePhase | null
  }>()

  for (const event of events) {
    if (event.eventType !== 'message.delta')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    const itemId = readPayloadString(payload, 'itemId') ?? `message-${event.id}`
    const delta = readPayloadString(payload, 'delta') ?? ''
    const current = streams.get(itemId)
    streams.set(itemId, {
      content: `${current?.content ?? ''}${delta}`,
      createdAt: current?.createdAt ?? event.createdAt,
      order: current?.order ?? event.id,
      phase: current?.phase ?? readAssistantMessagePhase(payload),
    })
  }

  const rows: OrderedTranscriptProcessRow[] = []
  for (const [itemId, stream] of streams) {
    const content = stripBuddyAnimationIntentBlocks(stream.content)?.trim() ?? ''
    if (!content)
      continue

    const message: BuddyMessage = {
      attachments: [],
      branchId: null,
      conversationId: null,
      content,
      createdAt: stream.createdAt,
      id: `stream-${runId}-${itemId}`,
      parentMessageId: null,
      role: 'assistant',
      runId: null,
      sessionId: null,
      versionGroupId: null,
      versionIndex: null,
      versionStatus: null,
    }
    const [row] = createChatMessageViewRows([message], t)
    rows.push({
      order: stream.order,
      row: {
        ...row,
        flow: itemId === finalStreamItemId || stream.phase === 'final_answer'
          ? 'final'
          : 'process',
        key: `message-stream-${runId}-${itemId}`,
        runId,
        type: 'message',
      },
    })
  }

  return rows
}

function mergeAdjacentActivityRows(
  rows: ReadonlyArray<OrderedTranscriptProcessRow>,
): ReadonlyArray<OrderedTranscriptProcessRow> {
  const merged: OrderedTranscriptProcessRow[] = []
  let index = 0

  while (index < rows.length) {
    const current = rows[index]
    if (current.row.type !== 'activity') {
      merged.push(current)
      index += 1
      continue
    }

    const group: OrderedTranscriptProcessRow[] = [current]
    index += 1
    while (isMergeableActivityRow(current.row, rows[index]?.row)) {
      group.push(rows[index])
      index += 1
    }

    merged.push(group.length === 1 ? group[0] : mergeActivityGroup(group))
  }

  return merged
}

function mergeActivityGroup(
  group: ReadonlyArray<OrderedTranscriptProcessRow>,
): OrderedTranscriptProcessRow {
  const activityRows = group
    .map(item => item.row)
    .filter((row): row is BuddyChatTranscriptActivityRow => row.type === 'activity')
  const first = activityRows[0]
  const summaries = activityRows
    .map(row => row.summary.trim())
    .filter(Boolean)
  const outputs = activityRows
    .map(row => row.output?.trim())
    .filter((output): output is string => Boolean(output))
  const itemCount = activityRows.reduce((total, row) => total + (row.itemCount ?? 1), 0)

  return {
    order: group[0].order,
    row: {
      ...first,
      id: `${first.id}-merged`,
      itemCount,
      key: `${first.key}-merged`,
      output: outputs.length > 0
        ? compactRunEventText(outputs.join('\n\n'), MERGED_ACTIVITY_OUTPUT_PREVIEW_CHARS)
        : undefined,
      status: resolveMergedActivityStatus(activityRows),
      summary: compactRunEventText(summaries.join('\n'), MERGED_ACTIVITY_SUMMARY_PREVIEW_CHARS),
    },
  }
}

function isMergeableActivityRow(
  first: BuddyChatTranscriptActivityRow,
  second: BuddyChatTranscriptProcessRow | undefined,
): second is BuddyChatTranscriptActivityRow {
  return second?.type === 'activity'
    && first.kind === 'tool'
    && second.kind === first.kind
    && second.label === first.label
}

function resolveMergedActivityStatus(
  rows: ReadonlyArray<BuddyChatTranscriptActivityRow>,
): BuddyChatTranscriptActivityRow['status'] {
  if (rows.some(row => row.status === 'running'))
    return 'running'

  if (rows.some(row => row.status === 'failed'))
    return 'failed'

  return 'completed'
}

function createTranscriptRunRow(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  collapsedAssistantMessage: BuddyChatTranscriptMessageRow | null,
  t: BuddyTranslate,
): BuddyChatTranscriptRunRow {
  const status = resolveRunStatus(events)
  const duration = formatRunDuration(resolveRunElapsedSeconds(events))

  return {
    collapsedAssistantMessage,
    key: `run-${runId}`,
    label: resolveRunElapsedLabel(status, duration, t),
    runId,
    status,
    summary: '',
    type: 'run',
  }
}

function createCollapsedAssistantMessage(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  message: BuddyChatMessageViewRow | undefined,
  t: BuddyTranslate,
): BuddyChatTranscriptMessageRow | null {
  const projectedFinalMessage = createCollapsedProjectedFinalAssistantMessage(runId, events, t)
  if (projectedFinalMessage)
    return projectedFinalMessage

  const streamMessage = createCollapsedStreamAssistantMessage(runId, events, t)
  if (streamMessage)
    return streamMessage

  if (!message)
    return null

  return {
    ...message,
    flow: 'final',
    key: `message-collapsed-${runId}-${message.id}`,
    runId,
    type: 'message',
  }
}

function createCollapsedProjectedFinalAssistantMessage(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): BuddyChatTranscriptMessageRow | null {
  const finalMessage = resolveProjectedFinalAssistantMessage(events)
  const content = stripBuddyAnimationIntentBlocks(finalMessage?.text ?? '')?.trim() ?? ''
  if (!content)
    return null

  return createCollapsedAssistantMessageRow(
    runId,
    `projected-${finalMessage?.itemId ?? 'final'}`,
    content,
    finalMessage?.createdAt ?? events[events.length - 1]?.createdAt ?? '',
    t,
  )
}

function createCollapsedStreamAssistantMessage(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): BuddyChatTranscriptMessageRow | null {
  const finalStreamItemId = resolveFinalAssistantMessageItemId(events)
  if (!finalStreamItemId)
    return null

  const chunks: { createdAt: string, text: string }[] = []

  for (const event of events) {
    if (event.eventType !== 'message.delta')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    if ((readPayloadString(payload, 'itemId') ?? `message-${event.id}`) !== finalStreamItemId)
      continue

    chunks.push({
      createdAt: event.createdAt,
      text: readPayloadString(payload, 'delta') ?? '',
    })
  }

  const content = stripBuddyAnimationIntentBlocks(chunks.map(chunk => chunk.text).join(''))?.trim() ?? ''
  if (!content)
    return null

  return createCollapsedAssistantMessageRow(
    runId,
    'stream',
    content,
    chunks[0]?.createdAt ?? events[events.length - 1]?.createdAt ?? '',
    t,
  )
}

function createCollapsedAssistantMessageRow(
  runId: string,
  idSuffix: string,
  content: string,
  createdAt: string,
  t: BuddyTranslate,
): BuddyChatTranscriptMessageRow {
  const [row] = createChatMessageViewRows([{
    attachments: [],
    branchId: null,
    conversationId: null,
    content,
    createdAt,
    id: `collapsed-${idSuffix}-${runId}`,
    parentMessageId: null,
    role: 'assistant',
    runId: null,
    sessionId: null,
    versionGroupId: null,
    versionIndex: null,
    versionStatus: null,
  }], t)

  return {
    ...row,
    flow: 'final',
    key: `message-collapsed-${runId}-${idSuffix}`,
    runId,
    type: 'message',
  }
}

type AssistantMessagePhase = 'commentary' | 'final_answer'

interface ProjectedFinalAssistantMessage {
  createdAt: string
  itemId: string | null
  phase: AssistantMessagePhase | null
  text: string
}

function resolveProjectedFinalAssistantMessage(
  events: ReadonlyArray<BuddyChatRunEvent>,
): ProjectedFinalAssistantMessage | null {
  for (const event of events.slice().reverse()) {
    if (event.eventType !== 'turn.completed')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    const finalAgentMessage = normalizeRunEventPayload(payload.finalAgentMessage)
    const text = readPayloadString(finalAgentMessage, 'text')
    if (!text)
      continue

    return {
      createdAt: event.createdAt,
      itemId: readPayloadString(finalAgentMessage, 'itemId') ?? readPayloadString(finalAgentMessage, 'id'),
      phase: readAssistantMessagePhase(finalAgentMessage),
      text,
    }
  }

  return null
}

function resolveFinalAssistantMessageItemId(events: ReadonlyArray<BuddyChatRunEvent>): string | null {
  const projectedFinalMessage = resolveProjectedFinalAssistantMessage(events)
  if (projectedFinalMessage?.itemId)
    return projectedFinalMessage.itemId

  let finalPhaseItemId: string | null = null
  let lastStreamItemId: string | null = null
  for (const event of events) {
    if (event.eventType !== 'message.delta')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    const itemId = readPayloadString(payload, 'itemId') ?? `message-${event.id}`
    lastStreamItemId = itemId
    if (readAssistantMessagePhase(payload) === 'final_answer')
      finalPhaseItemId = itemId
  }

  return finalPhaseItemId ?? lastStreamItemId
}

function readAssistantMessagePhase(payload: Record<string, unknown>): AssistantMessagePhase | null {
  const phase = readPayloadString(payload, 'phase')
  return phase === 'commentary' || phase === 'final_answer' ? phase : null
}

function groupRunsByMessageId(
  groups: ReadonlyArray<BuddyChatRunEventGroup>,
  key: 'assistantMessageId' | 'userMessageId',
): Map<string, BuddyChatRunEventGroup[]> {
  const grouped = new Map<string, BuddyChatRunEventGroup[]>()
  for (const group of groups) {
    const messageId = group[key]
    if (!messageId)
      continue

    const existing = grouped.get(messageId) ?? []
    existing.push(group)
    grouped.set(messageId, existing)
  }

  return grouped
}

function shouldSkipPersistedAssistantMessage(
  groups: ReadonlyArray<BuddyChatRunEventGroup>,
  usedRunIds: ReadonlySet<string>,
): boolean {
  return groups.some(group =>
    !usedRunIds.has(group.runId)
    && group.hasPersistedAssistantMessage
    && group.hasDeltaMessageRows,
  )
}

function appendAssistantRunPrelude(
  rows: BuddyChatTranscriptRow[],
  groups: ReadonlyArray<BuddyChatRunEventGroup>,
  usedRunIds: Set<string>,
) {
  for (const group of groups) {
    if (usedRunIds.has(group.runId) || !group.hasPersistedAssistantMessage)
      continue

    rows.push(group.run)
    rows.push(...group.processRows)
  }
}

function appendRunTailRows(
  rows: BuddyChatTranscriptRow[],
  groups: ReadonlyArray<BuddyChatRunEventGroup>,
  usedRunIds: Set<string>,
) {
  for (const group of groups) {
    if (usedRunIds.has(group.runId) || !group.hasPersistedAssistantMessage)
      continue

    if (group.references)
      rows.push(group.references)

    usedRunIds.add(group.runId)
  }
}

function appendPendingRunGroups(
  rows: BuddyChatTranscriptRow[],
  groups: ReadonlyArray<BuddyChatRunEventGroup>,
  usedRunIds: Set<string>,
) {
  for (const group of groups) {
    if (usedRunIds.has(group.runId) || group.hasPersistedAssistantMessage)
      continue

    rows.push(group.run)
    rows.push(...group.processRows)
    if (group.references)
      rows.push(group.references)
    usedRunIds.add(group.runId)
  }
}

function createTranscriptReferencesRow(
  runId: string,
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): BuddyChatTranscriptReferencesRow | null {
  const items = createTranscriptReferencesItems(events, t)
  if (items.length === 0)
    return null

  const referenceCount = countReferenceItems(items)

  return {
    defaultOpen: false,
    items,
    key: `references-${runId}`,
    runId,
    summaryLabel: t('references.itemCount', { count: referenceCount }),
    title: t('references.title'),
    type: 'references',
  }
}

function createTranscriptReferencesItems(
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): ReadonlyArray<BuddyChatTranscriptReferencesItem> {
  const references: BuddyChatTranscriptReferencesItem[] = []

  for (const event of events) {
    const payload = normalizeRunEventPayload(event.payload)
    if (event.eventType === 'memory.context_pack') {
      const sourceCount = readPayloadNumber(payload, 'sourceCount')
      const injected = readPayloadBoolean(payload, 'injected')
      const available = readPayloadBoolean(payload, 'available') ?? injected ?? sourceCount > 0
      if (!available && sourceCount <= 0)
        continue

      const entries = Array.isArray(payload.entries) ? payload.entries : []
      const memoryItems: BuddyChatTranscriptReferencesItem[] = []
      for (const entry of entries) {
        const item = createBuddyContextMemoryReferenceItem(normalizeRunEventPayload(entry), t)
        if (item)
          memoryItems.push(item)
      }
      references.push(...memoryItems.slice(0, sourceCount || undefined))
      continue
    }

    if (event.eventType === 'assistant.references') {
      const citation = normalizeRunEventPayload(payload.citation)
      const entries = Array.isArray(citation.entries) ? citation.entries : []
      const items = entries
        .map(entry => createCodexMemoryReferenceItem(normalizeRunEventPayload(entry), t))
        .filter((item): item is BuddyChatTranscriptReferencesItem => item !== null)
      if (items.length === 0)
        continue

      references.push(...items)
    }
  }

  return references
}

function countReferenceItems(items: ReadonlyArray<BuddyChatTranscriptReferencesItem>): number {
  const contentItemCount = items.filter(item => item.kind !== 'meta').length
  return contentItemCount > 0 ? contentItemCount : items.length
}

function createBuddyContextMemoryReferenceItem(
  entry: Record<string, unknown>,
  t: BuddyTranslate,
): BuddyChatTranscriptReferencesItem | null {
  const path = readPayloadString(entry, 'path')
  const content = readPayloadString(entry, 'content')?.trim()
  if (!path || !content)
    return null

  const lineStart = readPayloadNumber(entry, 'lineStart')
  const lineEnd = readPayloadNumber(entry, 'lineEnd')
  const range = lineStart > 0 && lineEnd > 0
    ? ` ${formatReferenceLineRange(lineStart, lineEnd, t)}`
    : ''
  const sourceEventId = readPayloadString(entry, 'sourceEventId') ?? ''
  const sourceRunId = readPayloadString(entry, 'sourceRunId') ?? ''

  return {
    body: compactReferenceBody(content, 240),
    detail: content,
    key: `buddy-memory-${path}${range}-${sourceRunId}-${sourceEventId}`,
    kind: 'memory',
    label: `${path}${range}`,
    summary: t('references.buddyContext'),
  }
}

function createCodexMemoryReferenceItem(
  entry: Record<string, unknown>,
  t: BuddyTranslate,
): BuddyChatTranscriptReferencesItem | null {
  const path = readPayloadString(entry, 'path')
  if (!path)
    return null

  const lineStart = readPayloadNumber(entry, 'lineStart')
  const lineEnd = readPayloadNumber(entry, 'lineEnd')
  const range = lineStart > 0 && lineEnd > 0
    ? ` ${formatReferenceLineRange(lineStart, lineEnd, t)}`
    : ''
  const note = readPayloadString(entry, 'note') ?? ''

  return {
    body: note,
    detail: note,
    key: `codex-${path}${range}`,
    kind: 'codex',
    label: `${path}${range}`,
    summary: t('references.codexMemory'),
  }
}

function formatReferenceLineRange(
  lineStart: number,
  lineEnd: number,
  t: BuddyTranslate,
): string {
  if (lineStart === lineEnd)
    return t('references.lineNumber', { line: lineStart })

  return t('references.lineRange', { end: lineEnd, start: lineStart })
}

function compactReferenceBody(content: string, maxChars: number): string {
  const body = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')

  if (body.length <= maxChars)
    return body

  return `${body.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function resolveRunUserMessageId(events: ReadonlyArray<BuddyChatRunEvent>): string | null {
  for (const event of events) {
    if (event.eventType !== 'run.started')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    const userMessageId = readPayloadString(payload, 'userMessageId')
    if (userMessageId)
      return userMessageId
  }

  return null
}

function resolveRunAssistantMessageId(events: ReadonlyArray<BuddyChatRunEvent>): string | null {
  for (const event of events) {
    if (event.eventType !== 'message.completed')
      continue

    const payload = normalizeRunEventPayload(event.payload)
    const messageId = readPayloadString(payload, 'messageId')
    if (messageId)
      return messageId
  }

  return null
}

function resolveGroupFirstEventId(events: ReadonlyArray<BuddyChatRunEvent>): number {
  return events[0]?.id ?? Number.MAX_SAFE_INTEGER
}

function resolveRunStatus(
  events: ReadonlyArray<BuddyChatRunEvent>,
): BuddyChatTranscriptRunRow['status'] {
  if (events.some(event => event.eventType === 'run.cancelled'))
    return 'cancelled'

  if (events.some(event => event.eventType === 'run.failed'))
    return 'failed'

  if (events.some(event => event.eventType === 'run.completed'))
    return 'completed'

  return 'running'
}

function resolveRunElapsedSeconds(events: ReadonlyArray<BuddyChatRunEvent>): number {
  const firstEventTime = readEventTime(events[0])
  const lastEventTime = readEventTime(events[events.length - 1])
  if (firstEventTime === null || lastEventTime === null)
    return 0

  return Math.max(0, Math.round((lastEventTime - firstEventTime) / 1000))
}

function readEventTime(event: BuddyChatRunEvent | undefined): number | null {
  if (!event)
    return null

  const time = Date.parse(event.createdAt)
  return Number.isNaN(time) ? null : time
}

function formatRunDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  const parts: string[] = []

  if (hours > 0)
    parts.push(`${hours}h`)

  if (minutes > 0)
    parts.push(`${minutes}m`)

  if (remainingSeconds > 0 || parts.length === 0)
    parts.push(`${remainingSeconds}s`)

  return parts.join('')
}

function resolveRunElapsedLabel(
  status: BuddyChatTranscriptRunRow['status'],
  duration: string,
  t: BuddyTranslate,
): string {
  if (status === 'cancelled')
    return t('transcript.elapsed.cancelled', { duration })

  if (status === 'failed')
    return t('transcript.elapsed.failed', { duration })

  if (status === 'completed')
    return t('transcript.elapsed.completed', { duration })

  return t('transcript.elapsed.running', { duration })
}

function resolveEventItemId(event: BuddyChatRunEvent): string | null {
  const payload = normalizeRunEventPayload(event.payload)
  const turnId = readPayloadString(payload, 'turnId')
  const itemId = readPayloadString(payload, 'itemId')
  if (event.eventType === 'plan.delta' || event.eventType === 'plan.updated')
    return itemId ?? `plan-${turnId ?? event.id}`

  if (event.eventType === 'turn.diff.updated')
    return itemId ?? `diff-${turnId ?? event.id}`

  if (event.eventType === 'tool.patch_updated')
    return itemId ?? `patch-${event.id}`

  if (event.eventType === 'run.failed')
    return `run-failed-${event.id}`

  return readPayloadString(payload, 'itemId')
    ?? readPayloadString(payload, 'messageId')
    ?? readPayloadString(payload, 'userMessageId')
}

function readPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed))
      return parsed
  }

  return 0
}

function readPayloadBoolean(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key]
  return typeof value === 'boolean' ? value : null
}
