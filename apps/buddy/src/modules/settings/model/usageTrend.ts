import type { UsagePeriod, UsageTrendRequest } from '@buddy-shared/usage/usageAnalyticsApi'
import { shiftUsageDate } from './usageAnalytics'

export type UsageTrendView = 'day' | 'week' | 'month' | 'year'

export function usageTrendRequest(view: UsageTrendView, date: string, annual: UsagePeriod): UsageTrendRequest {
  if (view === 'year')
    return { ...annual, granularity: 'day' }
  let startDate = date
  let endDate = date
  if (view === 'week') {
    startDate = shiftUsageDate(date, -((new Date(date).getUTCDay() + 6) % 7))
    endDate = shiftUsageDate(startDate, 6)
  }
  else if (view === 'month') {
    startDate = `${date.slice(0, 7)}-01`
    const end = new Date(startDate)
    end.setUTCMonth(end.getUTCMonth() + 1)
    end.setUTCDate(0)
    endDate = end.toISOString().slice(0, 10)
  }
  return { startDate, endDate, timeZone: annual.timeZone, granularity: view === 'day' ? 'hour' : 'day' }
}
