import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { NotificationAssetsService } from '../notification-assets.service'

describe('notificationAssetsService attachment', () => {
  it('rejects stale asset attachment when the asset cannot be claimed', async () => {
    const prisma = {
      platformNotificationAsset: {
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    }
    const service = new NotificationAssetsService(
      prisma as never,
      {} as never,
      createConfigServiceMock() as never,
    )

    await expect(service.attachAssetsToNotification({
      notificationId: 'notification-1',
      assetIds: ['asset-1'],
    })).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.platformNotificationAsset.updateMany).toHaveBeenCalledTimes(1)
  })
})

function createConfigServiceMock() {
  return {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'jwt') {
        return {
          accessSecret: 'test-secret',
        }
      }

      if (key === 'server.isProduction') {
        return false
      }

      throw new Error(`Unexpected config key: ${key}`)
    }),
  }
}
