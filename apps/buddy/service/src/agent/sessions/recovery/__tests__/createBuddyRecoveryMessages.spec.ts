import type { Model } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'

import { createBuddyRecoveryMessages } from '../createBuddyRecoveryMessages'

describe('createBuddyRecoveryMessages', () => {
  it('reconstructs only committed history before the current triggering message', () => {
    const messages = createBuddyRecoveryMessages({
      fallbackModel: model('fallback', 'model-fallback'),
      messages: [
        message('user-1', 'user', { modelInputText: 'Materialized first prompt', text: 'First' }),
        message('assistant-1', 'assistant', { state: 'interrupted', text: 'Partial answer', truncated: false }, 'run-1'),
        message('tool-1', 'tool', { toolCallId: 'tool-1', toolName: 'read' }, 'run-1'),
        message('user-2', 'user', { text: 'Current prompt' }),
        message('assistant-stale', 'assistant', { text: 'Must not be replayed' }, 'run-stale'),
      ],
      resolveRunModel: runId => runId === 'run-1'
        ? model('anthropic', 'claude-sonnet-4-5')
        : null,
      resolveUserInput: messageId => messageId === 'user-1'
        ? {
            images: [{ attachmentId: 'attachment-1', mimeType: 'image/png' }],
            prompt: 'Durable first prompt',
          }
        : null,
      triggeringMessageId: 'user-2',
    })

    expect(messages).toMatchObject([
      {
        buddyInput: {
          images: [{ attachmentId: 'attachment-1', mimeType: 'image/png' }],
          messageId: 'user-1',
          prompt: 'Durable first prompt',
          version: 1,
        },
        content: [
          { text: 'Durable first prompt', type: 'text' },
          { data: '', mimeType: 'image/png', type: 'image' },
        ],
        role: 'user',
      },
      {
        content: [{ text: 'Partial answer', type: 'text' }],
        model: 'claude-sonnet-4-5',
        provider: 'anthropic',
        role: 'assistant',
        stopReason: 'aborted',
      },
    ])
  })
})

function message(
  id: string,
  role: 'assistant' | 'tool' | 'user',
  content: unknown,
  runId: string | null = null,
) {
  return {
    branchId: 'branch-1',
    content,
    conversationId: 'conversation-1',
    createdAt: '2026-08-15T00:00:00.000Z',
    id,
    role,
    runId,
  }
}

function model(provider: string, id: string): Model<any> {
  return {
    api: 'anthropic-messages',
    baseUrl: 'https://example.test',
    contextWindow: 200_000,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id,
    input: ['text'],
    maxTokens: 8_192,
    name: id,
    provider,
    reasoning: false,
  }
}
