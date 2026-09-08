import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import {
  createConversationTimelineCursor,
  parseConversationTimelineCursor,
} from '../conversationTimelineCursor'

describe('conversation timeline cursor', () => {
  it('round-trips an ordered item boundary only inside its active branch projection', () => {
    const cursor = createConversationTimelineCursor({
      before: {
        branchId: 'branch-root',
        id: 'compact-1',
        kind: 'compaction',
        occurredAt: '2026-08-15T00:00:00.000Z',
      },
      branchId: 'branch-child',
      conversationId: 'conversation-1',
    })

    expect(cursor).not.toContain('compact-1')
    expect(parseConversationTimelineCursor(cursor, {
      branchId: 'branch-child',
      conversationId: 'conversation-1',
    })).toEqual({
      branchId: 'branch-root',
      id: 'compact-1',
      kind: 'compaction',
      occurredAt: '2026-08-15T00:00:00.000Z',
    })
    expect(() => parseConversationTimelineCursor(cursor, {
      branchId: 'branch-other',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
  })

  it('rejects malformed, unsupported, and structurally invalid boundaries', () => {
    expect(() => parseConversationTimelineCursor('not-json', {
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
    const unsupported = Buffer.from(JSON.stringify({
      before: {
        branchId: 'branch-1',
        id: 'message-1',
        kind: 'message',
        occurredAt: 'not-a-date',
      },
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      version: 2,
    })).toString('base64url')
    expect(() => parseConversationTimelineCursor(unsupported, {
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
  })
})
