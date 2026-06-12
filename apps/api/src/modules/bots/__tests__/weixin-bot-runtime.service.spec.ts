import { BOT_RUNTIME_STATE } from '@haohaoxue/samepage-contracts'
import { BotAccountStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { WeixinBotRuntimeService } from '../weixin-bot-runtime.service'

describe('weixinBotRuntimeService lifecycle', () => {
  it('does not persist user stop state during module shutdown', async () => {
    const botAccountUpdates: unknown[] = []
    const prisma = {
      botAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'account-1',
          userId: 'user-1',
          credentialEncrypted: 'encrypted',
          getUpdatesCursor: '',
        }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockImplementation(async (input: { data: unknown }) => {
          botAccountUpdates.push(input.data)
          return input
        }),
      },
    }
    const service = new WeixinBotRuntimeService(
      prisma as never,
      {
        decryptWeixinCredential: vi.fn().mockReturnValue({
          id: 'account-1',
          ownerUserId: 'user-1',
          accountId: 'weixin-bot-1',
          baseUrl: 'https://example.com',
          token: 'token-1',
          savedAt: '2026-06-12T00:00:00.000Z',
          getUpdatesCursor: '',
        }),
      } as never,
      {
        notifyStart: vi.fn().mockResolvedValue(undefined),
        notifyStop: vi.fn().mockResolvedValue(undefined),
        getUpdates: vi.fn().mockImplementation(({ abortSignal }: { abortSignal?: AbortSignal }) => {
          if (abortSignal?.aborted) {
            return Promise.resolve({ ret: 0, msgs: [] })
          }

          return new Promise(resolve => abortSignal?.addEventListener('abort', () => {
            resolve({ ret: 0, msgs: [] })
          }, { once: true }))
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await service.startAccount('account-1')
    expect([
      BOT_RUNTIME_STATE.STARTING,
      BOT_RUNTIME_STATE.RUNNING,
    ]).toContain(service.getStatus('account-1').state)

    await service.onModuleDestroy()

    expect(botAccountUpdates).not.toContainEqual(expect.objectContaining({
      status: BotAccountStatus.DISCONNECTED,
    }))
  })
})
