import type { BuddyRunEvent } from './BuddyRunEvent'
import { MAX_BUDDY_MESSAGE_TEXT_LENGTH } from '../../../shared/buddyMessageContent'

export interface InterruptedMessageSnapshot {
  messageId: string
  text: string
  truncated: boolean
}

export function createInterruptedMessageEvents(
  events: readonly BuddyRunEvent[],
): InterruptedMessageSnapshot[] {
  const terminalMessageIds = new Set(events.flatMap((event) => {
    if (event.type !== 'message.completed' && event.type !== 'message.interrupted')
      return []
    const messageId = readString(event.payload, 'messageId')
    return messageId ? [messageId] : []
  }))
  const snapshots = new Map<string, InterruptedMessageSnapshot>()
  for (const event of events) {
    if (event.type !== 'message.delta')
      continue
    if (readString(event.payload, 'phase') === 'commentary')
      continue
    const messageId = readString(event.payload, 'messageId')
    const delta = readString(event.payload, 'delta')
    if (!messageId || delta === null || terminalMessageIds.has(messageId))
      continue
    const current = snapshots.get(messageId) ?? {
      messageId,
      text: '',
      truncated: false,
    }
    const available = MAX_BUDDY_MESSAGE_TEXT_LENGTH - current.text.length
    snapshots.set(messageId, {
      ...current,
      text: current.text + delta.slice(0, Math.max(available, 0)),
      truncated: current.truncated || delta.length > available,
    })
  }
  return [...snapshots.values()].filter(snapshot => snapshot.text.trim().length > 0)
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : null
}
