import { describe, expect, it } from 'vitest'
import {
  PLATFORM_NOTIFICATION_ASSET_RESOLVE_MAX_COUNT,
  ResolvePlatformNotificationAssetsSchema,
} from '../notification'

describe('resolvePlatformNotificationAssetsSchema', () => {
  it('requires non-empty asset ids within the resolve batch limit', () => {
    expect(ResolvePlatformNotificationAssetsSchema.safeParse({
      assetIds: ['asset-1'],
    }).success).toBe(true)
    expect(ResolvePlatformNotificationAssetsSchema.safeParse({
      assetIds: [''],
    }).success).toBe(false)
    expect(ResolvePlatformNotificationAssetsSchema.safeParse({
      assetIds: Array.from(
        { length: PLATFORM_NOTIFICATION_ASSET_RESOLVE_MAX_COUNT + 1 },
        (_, index) => `asset-${index}`,
      ),
    }).success).toBe(false)
  })
})
