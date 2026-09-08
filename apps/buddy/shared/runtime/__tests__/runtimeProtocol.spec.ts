import { describe, expect, it } from 'vitest'

import {
  buddyServiceFailureNotificationSchema,
} from '../runtimeProtocol'

describe('runtime protocol v13', () => {
  it('accepts only stable runtime failure codes', () => {
    expect(buddyServiceFailureNotificationSchema.safeParse({
      code: 'EVENT_LOG_CORRUPTED',
    }).success).toBe(true)
    expect(buddyServiceFailureNotificationSchema.safeParse({
      code: 'EVENT_LOG_CORRUPTED',
      detail: '/private/path',
    }).success).toBe(false)
    expect(buddyServiceFailureNotificationSchema.safeParse({
      code: 'RAW_FILESYSTEM_ERROR',
    }).success).toBe(false)
  })
})
