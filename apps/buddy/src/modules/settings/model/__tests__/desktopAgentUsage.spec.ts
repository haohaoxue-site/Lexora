import type { LocalUsageSnapshot } from '@buddy-shared/usage/usageApi'

import { describe, expect, it } from 'vitest'
import { createDesktopAgentUsage } from '../desktopAgentUsage'

describe('desktopAgentUsage', () => {
  it('uses lifetime totals even when the returned detail window is smaller', () => {
    const snapshot = {
      records: [],
      totals: {
        cacheReadTokens: 30,
        cacheWriteTokens: 20,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 10,
        recordCount: 750,
        totalCost: 1.5,
        totalTokens: 210,
      },
    } satisfies LocalUsageSnapshot

    expect(createDesktopAgentUsage(snapshot).totals).toEqual(snapshot.totals)
  })
})
