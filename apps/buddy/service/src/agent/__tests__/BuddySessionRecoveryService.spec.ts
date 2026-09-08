import type { Api, Model } from '@earendil-works/pi-ai'
import { describe, expect, it, vi } from 'vitest'
import {
  BuddySessionRecoveryService,
  resolveRunSessionRecoveryPoint,
} from '../BuddySessionRecoveryService'

describe('buddySessionRecoveryService', () => {
  it('uses different product-history boundaries for a turn and a compaction', async () => {
    const history = [
      message('user-1', 'user', { text: 'First question' }),
      message('assistant-1', 'assistant', { text: 'First answer' }, 'run-1'),
      message('user-2', 'user', { text: 'Second question' }),
      message('assistant-2', 'assistant', { text: 'Second answer' }, 'run-2'),
    ]
    const resolveRecoveryInputImageReferences = vi.fn(async () => ({
      images: [],
      missingAttachmentIds: [],
    }))
    const service = new BuddySessionRecoveryService({
      attachments: { resolveRecoveryInputImageReferences },
      conversations: { listBranchMessages: () => history },
      models: { resolve: () => model() },
      runInputs: {
        findByTriggeringMessageId: messageId => ({
          attachmentIds: [],
          contextItems: [],
          createdAt: '2026-08-28T00:00:00.000Z',
          prompt: messageId === 'user-1' ? 'First durable prompt' : 'Second durable prompt',
          reasoning: null,
          runId: `run-${messageId}`,
          serviceTier: null,
        }),
      },
      runs: { findById: () => null },
    })

    const turn = await service.create({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      fallbackModel: model(),
      point: resolveRunSessionRecoveryPoint({ purpose: 'chat', triggeringMessageId: 'user-2' }),
    })
    const compaction = await service.create({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      fallbackModel: model(),
      point: resolveRunSessionRecoveryPoint({ purpose: 'conversation.compaction', triggeringMessageId: 'user-2' }),
    })

    expect(turn.messages.map(item => item.role)).toEqual(['user', 'assistant'])
    expect(compaction.messages.map(item => item.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    expect(compaction.messages.at(2)).toMatchObject({
      buddyInput: {
        images: [],
        messageId: 'user-2',
        prompt: 'Second durable prompt',
        version: 1,
      },
      content: [{ text: 'Second durable prompt', type: 'text' }],
      role: 'user',
    })
    await expect(service.create({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      fallbackModel: model(),
      point: { kind: 'before_message', messageId: 'missing-message' },
    })).rejects.toMatchObject({ code: 'CONVERSATION_BINDING_MISMATCH' })
  })
})

function message(
  id: string,
  role: 'assistant' | 'user',
  content: unknown,
  runId: string | null = null,
) {
  return {
    branchId: 'branch-1',
    content,
    conversationId: 'conversation-1',
    createdAt: '2026-08-28T00:00:00.000Z',
    id,
    role,
    runId,
  }
}

function model(): Model<Api> {
  return {
    api: 'anthropic-messages',
    baseUrl: 'https://example.test',
    contextWindow: 200_000,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: 'model-1',
    input: ['text'],
    maxTokens: 8_192,
    name: 'Model',
    provider: 'provider-1',
    reasoning: false,
  }
}
