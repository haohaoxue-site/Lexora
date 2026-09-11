import type { LocalUsageModelDay } from '@buddy-shared/usage/usageAnalyticsApi'
import { describe, expect, it } from 'vitest'
import { aggregateUsage, createUsageCalendar, createUsageModelDistribution, emptyUsageCounts, shiftUsageDate, usageDateRange, usageModelKey } from '../usageAnalytics'

const row: LocalUsageModelDay = { date: '2024-02-29', providerId: 'a', modelId: 'model', inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 4, totalTokens: 22, recordCount: 2 }

describe('usage view projections', () => {
  it('sums daily and model totals consistently and counts active days rather than calls', () => {
    const result = aggregateUsage([row, { ...row, providerId: 'b' }, { ...row, ...emptyUsageCounts(), recordCount: 1, date: '2024-03-01' }])
    expect(result.totals).toEqual({ inputTokens: 20, outputTokens: 10, cacheReadTokens: 6, cacheWriteTokens: 8, totalTokens: 44, recordCount: 5 })
    expect(result.activeDays).toBe(2)
    expect(result.models).toHaveLength(2)
    expect(result.days.map(day => day.recordCount)).toEqual([4, 1])
    expect(usageModelKey({ providerId: 'a:b', modelId: 'c' })).not.toBe(usageModelKey({ providerId: 'a', modelId: 'b:c' }))
  })

  it('keeps all model tokens in the pie, combining only the long tail and retaining service identities', () => {
    const models = aggregateUsage(Array.from({ length: 8 }, (_, index) => ({ ...row, providerId: `provider-${index}`, totalTokens: 8 - index }))).models
    const groups = createUsageModelDistribution(models)
    expect(groups).toHaveLength(6)
    expect(groups.reduce((sum, group) => sum + group.totalTokens, 0)).toBe(36)
    expect(groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1, 12)
    expect(groups.at(-1)).toMatchObject({ key: 'other', totalTokens: 6 })
    expect(groups.at(-1)!.members.map(member => member.providerId)).toEqual(['provider-5', 'provider-6', 'provider-7'])
    expect(createUsageModelDistribution(models.slice(0, 6))).toHaveLength(6)
    expect(createUsageModelDistribution([{ ...models[0]!, totalTokens: 0 }])[0]).toMatchObject({ share: 0 })
    expect(createUsageModelDistribution([])).toEqual([])
  })

  it('lays out leap days in seven-day columns, with no records, zero, and positive usage distinct', () => {
    const days = aggregateUsage([row, { ...row, ...emptyUsageCounts(), recordCount: 1, date: '2024-03-01' }]).days
    const weeks = createUsageCalendar('2024-02-28', '2024-03-02', days)
    expect(weeks.every(week => week.length === 7)).toBe(true)
    expect(weeks.flat().filter(cell => cell.inRange).map(cell => [cell.date, cell.level])).toEqual([
      ['2024-02-28', -1],
      ['2024-02-29', 4],
      ['2024-03-01', 0],
      ['2024-03-02', -1],
    ])
    expect(weeks.flat().filter(cell => !cell.inRange)).toHaveLength(3)
  })

  it('uses 365 dates for the rolling year and includes all 366 dates of a leap year', () => {
    expect(usageDateRange('recent', '2024-03-01')).toEqual({ startDate: '2023-03-03', endDate: '2024-03-01' })
    expect(usageDateRange(2024, '2026-09-01')).toEqual({ startDate: '2024-01-01', endDate: '2024-12-31' })
    expect(usageDateRange(2026, '2026-09-01').endDate).toBe('2026-09-01')
    expect(createUsageCalendar('2024-01-01', '2024-12-31', []).flat().filter(cell => cell.inRange)).toHaveLength(366)
    expect(shiftUsageDate('2024-03-01', -1)).toBe('2024-02-29')
  })
})
