import { describe, expect, it } from 'vitest'
import { usageTrendRequest } from '../usageTrend'

const annual = { startDate: '2024-01-01', endDate: '2024-12-31', timeZone: 'Asia/Shanghai' }

describe('usage trend windows', () => {
  it('requests hourly data only inside the selected day', () => {
    expect(usageTrendRequest('day', '2024-02-29', annual)).toEqual({ startDate: '2024-02-29', endDate: '2024-02-29', timeZone: 'Asia/Shanghai', granularity: 'hour' })
  })

  it('uses seven daily points in a Monday-based week, including cross-year boundaries', () => {
    expect(usageTrendRequest('week', '2024-12-31', annual)).toEqual({ startDate: '2024-12-30', endDate: '2025-01-05', timeZone: 'Asia/Shanghai', granularity: 'day' })
    expect(usageTrendRequest('week', '2024-01-07', annual)).toMatchObject({ startDate: '2024-01-01', endDate: '2024-01-07' })
  })

  it('limits month views to one calendar month, accounting for leap years and December', () => {
    expect(usageTrendRequest('month', '2024-02-12', annual)).toMatchObject({ startDate: '2024-02-01', endDate: '2024-02-29', granularity: 'day' })
    expect(usageTrendRequest('month', '2025-02-12', annual)).toMatchObject({ startDate: '2025-02-01', endDate: '2025-02-28' })
    expect(usageTrendRequest('month', '2024-12-31', annual)).toMatchObject({ startDate: '2024-12-01', endDate: '2024-12-31' })
  })

  it('uses the selected annual window rather than grouping a year into daily, weekly or monthly buckets', () => {
    expect(usageTrendRequest('year', '2024-02-29', annual)).toEqual({ ...annual, granularity: 'day' })
    const recent = { ...annual, startDate: '2023-03-03', endDate: '2024-03-01' }
    expect(usageTrendRequest('year', '2024-02-29', recent)).toEqual({ ...recent, granularity: 'day' })
  })
})
