import { CHAT_SESSION_ORIGIN } from '@haohaoxue/samepage-contracts'
import { ConflictException } from '@nestjs/common'
import { ChatSessionChannel, ChatSessionOrigin } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ChatSessionsService } from './chat-sessions.service'

function createBotSession() {
  const now = new Date('2026-06-12T00:00:00.000Z')

  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    origin: ChatSessionOrigin.GLOBAL,
    channel: ChatSessionChannel.WEIXIN_BOT,
    title: '微信 · user',
    selectedProviderId: null,
    selectedModelId: null,
    agentProfileId: null,
    agentProfile: null,
    modelOverrideProviderId: null,
    modelOverrideModelId: null,
    activeRootMessageId: null,
    activeLeafMessageId: null,
    nextEventSequence: 1,
    historyVersion: 0,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

describe('chatSessionsService channel mutation guards', () => {
  it('rejects external user messages in bot-owned sessions', async () => {
    const prisma = {
      chatSession: {
        findFirst: vi.fn().mockResolvedValue(createBotSession()),
      },
      chatSessionRun: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async () => {
        throw new Error('unexpected mutation')
      }),
    }
    const service = new ChatSessionsService(
      prisma as never,
      {} as never,
      {
        resolveForUserMessage: vi.fn().mockResolvedValue({
          content: 'hello',
          metadata: {
            attachments: [],
            contentJSON: { type: 'doc', content: [] },
          },
          snapshots: [],
        }),
      } as never,
      {} as never,
      {} as never,
    )

    await expect(service.sendMessage({
      userId: 'user-1',
      sessionId: 'session-1',
      origin: CHAT_SESSION_ORIGIN.GLOBAL,
      content: 'hello',
      contentJSON: { type: 'doc', content: [] },
      attachments: [],
      generationId: 'generation-1',
      runId: 'run-1',
      modelTargetSnapshot: {} as never,
    })).rejects.toBeInstanceOf(ConflictException)
  })
})
