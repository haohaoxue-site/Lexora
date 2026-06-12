import { readFileSync } from 'node:fs'
import { BOT_RUNTIME_STATE } from '@haohaoxue/samepage-contracts'
import { ConflictException } from '@nestjs/common'
import { BotAccountChannel, BotAccountStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { BotsService } from './bots.service'

function createBotAccount(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-12T00:00:00.000Z')

  return {
    id: 'account-1',
    userId: 'user-1',
    channel: BotAccountChannel.WEIXIN,
    externalAccountId: 'weixin-bot-1',
    externalUserId: null,
    displayName: null,
    credentialEncrypted: 'encrypted',
    getUpdatesCursor: '',
    status: BotAccountStatus.CONNECTED,
    lastError: null,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('botsService Weixin binding', () => {
  it('rejects binding a Weixin bot account owned by another user', async () => {
    const prisma = {
      botAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(createBotAccount({ userId: 'other-user' })),
        upsert: vi.fn().mockResolvedValue(createBotAccount()),
      },
    }
    const service = new BotsService(
      prisma as never,
      {
        decryptWeixinCredential: vi.fn(),
        encryptWeixinCredential: vi.fn().mockReturnValue('encrypted'),
      } as never,
      {
        fetchQrCode: vi.fn().mockResolvedValue({
          qrcode: 'qrcode',
          qrcode_img_content: 'qrcode text',
        }),
        getQrStatus: vi.fn().mockResolvedValue({
          status: 'confirmed',
          bot_token: 'token-1',
          ilink_bot_id: 'weixin-bot-1',
        }),
      } as never,
      {
        getStatus: vi.fn().mockReturnValue({ state: BOT_RUNTIME_STATE.NOT_BOUND }),
        startAccount: vi.fn(),
      } as never,
    )
    const login = await service.startWeixinLogin('user-1')

    await expect(service.getWeixinLoginStatus('user-1', login.loginId))
      .rejects
      .toBeInstanceOf(ConflictException)
  })

  it('keeps one Weixin bot per user and one owner per external account in schema', () => {
    const schema = readFileSync(new URL('../../../prisma/bot.prisma', import.meta.url), 'utf8')

    expect(schema).toContain('@@unique([userId, channel])')
    expect(schema).toContain('@@unique([channel, externalAccountId])')
  })
})
