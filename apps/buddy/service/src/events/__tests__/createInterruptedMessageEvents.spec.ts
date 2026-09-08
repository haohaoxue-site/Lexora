import type { BuddyRunEvent } from '../BuddyRunEvent'
import { describe, expect, it } from 'vitest'
import { MAX_BUDDY_MESSAGE_TEXT_LENGTH } from '../../../../shared/conversation/buddyMessageContent'
import { createInterruptedMessageEvents } from '../createInterruptedMessageEvents'

describe('createInterruptedMessageEvents', () => {
  it('recovers ordered unfinished answers once without resurrecting commentary or terminal messages', () => {
    const events = [
      event(1, 'message.delta', { delta: 'Hel', messageId: 'assistant-1', phase: 'final_answer' }),
      event(2, 'message.delta', { delta: 'Second', messageId: 'assistant-2' }),
      event(3, 'message.delta', { delta: 'lo', messageId: 'assistant-1', phase: 'final_answer' }),
      event(4, 'message.delta', { delta: 'Working', messageId: 'commentary', phase: 'commentary' }),
      event(5, 'message.delta', { delta: '', messageId: 'empty' }),
      event(6, 'message.delta', { delta: ' \n ', messageId: 'whitespace' }),
    ]
    expect(createInterruptedMessageEvents(events)).toEqual([
      { messageId: 'assistant-1', text: 'Hello', truncated: false },
      { messageId: 'assistant-2', text: 'Second', truncated: false },
    ])
    events.push(
      event(7, 'message.interrupted', {
        content: { state: 'interrupted', text: 'Hello', truncated: false },
        messageId: 'assistant-1',
        reason: 'runtime_restarted',
        role: 'assistant',
      }),
      event(8, 'message.completed', {
        content: { text: 'Second' },
        messageId: 'assistant-2',
        role: 'assistant',
        stopReason: 'stop',
      }),
    )
    expect(createInterruptedMessageEvents(events)).toEqual([])
  })

  it('ignores malformed deltas and bounds recovered content deterministically', () => {
    const prefix = 'a'.repeat(MAX_BUDDY_MESSAGE_TEXT_LENGTH - 1)
    expect(createInterruptedMessageEvents([
      event(1, 'message.delta', { delta: prefix, messageId: 'assistant-large' }),
      event(2, 'message.delta', { delta: 'bc', messageId: 'assistant-large' }),
      event(3, 'message.delta', { delta: 42, messageId: 'assistant-invalid-delta' }),
      event(4, 'message.delta', { delta: 'missing id' }),
    ])).toEqual([{ messageId: 'assistant-large', text: `${prefix}b`, truncated: true }])
  })
})

function event(sequence: number, type: string, payload: unknown): BuddyRunEvent {
  return { createdAt: '2026-08-16T00:00:00.000Z', payload, runId: 'run-1', sequence, type }
}
