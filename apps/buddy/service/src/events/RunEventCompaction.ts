import type { BuddyRunEvent } from './BuddyRunEvent'

export interface RunEventCompactionPlan {
  readonly removed: readonly BuddyRunEvent[]
  readonly retained: readonly BuddyRunEvent[]
}

interface RunEventCompactionFacts {
  readonly completedBlockKeys: ReadonlySet<string>
  readonly completedMessageIds: ReadonlySet<string>
  readonly completedToolCallIds: ReadonlySet<string>
  readonly latestToolUpdateSequences: ReadonlyMap<string, number>
}

export function createRunEventCompactionPlan(
  events: readonly BuddyRunEvent[],
): RunEventCompactionPlan {
  const completedMessageIds = new Set(events.flatMap((event) => {
    if (event.type !== 'message.completed' && event.type !== 'message.interrupted')
      return []
    const messageId = readMessageId(event.payload)
    return messageId ? [messageId] : []
  }))
  const completedBlockKeys = new Set(events.flatMap((event) => {
    if (event.type !== 'message.block.completed')
      return []
    const key = readMessageBlockKey(event.payload)
    return key ? [key] : []
  }))
  const completedToolCallIds = new Set(events.flatMap((event) => {
    if (event.type !== 'tool.completed')
      return []
    const toolCallId = readToolCallId(event.payload)
    return toolCallId ? [toolCallId] : []
  }))
  const latestToolUpdateSequences = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'tool.updated')
      continue
    const toolCallId = readToolCallId(event.payload)
    if (toolCallId)
      latestToolUpdateSequences.set(toolCallId, event.sequence)
  }
  const removed = events.filter(event => shouldRemoveRunEvent(event, {
    completedBlockKeys,
    completedMessageIds,
    completedToolCallIds,
    latestToolUpdateSequences,
  }))
  const removedSequences = new Set(removed.map(event => event.sequence))
  return {
    removed,
    retained: events.filter(event => !removedSequences.has(event.sequence)),
  }
}

function shouldRemoveRunEvent(
  event: BuddyRunEvent,
  facts: RunEventCompactionFacts,
): boolean {
  if (event.type === 'message.delta')
    return facts.completedMessageIds.has(readMessageId(event.payload) ?? '')
  if (event.type === 'message.block.delta')
    return facts.completedBlockKeys.has(readMessageBlockKey(event.payload) ?? '')
  if (event.type !== 'tool.updated')
    return false
  const toolCallId = readToolCallId(event.payload) ?? ''
  return facts.completedToolCallIds.has(toolCallId)
    || facts.latestToolUpdateSequences.get(toolCallId) !== event.sequence
}

function readMessageId(value: unknown): string | null {
  const payload = readRecord(value)
  return typeof payload?.messageId === 'string' && payload.messageId.length > 0
    ? payload.messageId
    : null
}

function readMessageBlockKey(value: unknown): string | null {
  const payload = readRecord(value)
  const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null
  const contentIndex = typeof payload?.contentIndex === 'number'
    && Number.isSafeInteger(payload.contentIndex)
    && payload.contentIndex >= 0
    ? payload.contentIndex
    : null
  const kind = payload?.kind === 'text' || payload?.kind === 'reasoning'
    ? payload.kind
    : null
  return messageId && contentIndex !== null && kind
    ? `${messageId}:${contentIndex}:${kind}`
    : null
}

function readToolCallId(value: unknown): string | null {
  const payload = readRecord(value)
  return typeof payload?.toolCallId === 'string' && payload.toolCallId
    ? payload.toolCallId
    : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
