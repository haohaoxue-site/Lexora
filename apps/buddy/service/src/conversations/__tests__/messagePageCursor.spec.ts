import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import {
  createMessagePageCursor,
  parseMessagePageCursor,
} from '../messagePageCursor'

describe('message page cursor', () => {
  it('round-trips a message boundary only inside its bound branch projection', () => {
    const cursor = createMessagePageCursor({
      beforeMessageId: 'message-100',
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })

    expect(cursor).not.toContain('message-100')
    expect(parseMessagePageCursor(cursor, {
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })).toBe('message-100')
    expect(() => parseMessagePageCursor(cursor, {
      branchId: 'branch-2',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
  })

  it('rejects malformed and unsupported cursors', () => {
    expect(() => parseMessagePageCursor('not-json', {
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
    const unsupported = Buffer.from(JSON.stringify({
      beforeMessageId: 'message-1',
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      version: 2,
    })).toString('base64url')
    expect(() => parseMessagePageCursor(unsupported, {
      branchId: 'branch-1',
      conversationId: 'conversation-1',
    })).toThrow(/cursor/i)
  })
})
