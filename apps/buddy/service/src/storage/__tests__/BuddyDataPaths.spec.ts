import { describe, expect, it } from 'vitest'

import { BuddyDataPaths } from '../BuddyDataPaths'

describe('buddyDataPaths', () => {
  it('keeps every durable conversation resource under one conversation directory', () => {
    const paths = new BuddyDataPaths('/home/user/.lexora/buddy')

    expect(paths.conversationWorkspace('conversation-1')).toBe(
      '/home/user/.lexora/buddy/conversations/conversation-1/workspace',
    )
    expect(paths.messageInputs('conversation-1', 'message-1')).toBe(
      '/home/user/.lexora/buddy/conversations/conversation-1/inputs/message-1',
    )
    expect(paths.runEventFile('conversation-1', 'run-1')).toBe(
      '/home/user/.lexora/buddy/conversations/conversation-1/events/run-1.jsonl',
    )
    expect(paths.sessionDirectory('conversation-1', 'branch-1')).toBe(
      '/home/user/.lexora/buddy/conversations/conversation-1/session/branch-1',
    )
  })

  it('rejects path-like identities instead of escaping the Buddy root', () => {
    const paths = new BuddyDataPaths('/home/user/.lexora/buddy')

    expect(() => paths.conversationDirectory('../outside')).toThrow()
    expect(() => paths.messageInputs('conversation-1', 'nested/message')).toThrow()
  })
})
