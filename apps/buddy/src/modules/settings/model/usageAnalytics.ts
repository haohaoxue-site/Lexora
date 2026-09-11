import type { LocalUsageModelDay, UsageCounts, UsageModel } from '@buddy-shared/usage/usageAnalyticsApi'

export interface UsageDay extends UsageCounts {
  date: string
}

export interface UsageModelTotals extends UsageCounts, UsageModel {}

export function emptyUsageCounts(): UsageCounts {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, recordCount: 0 }
}

export function usageModelKey(model: UsageModel): string {
  return JSON.stringify([model.providerId, model.modelId])
}

export function aggregateUsage(rows: readonly LocalUsageModelDay[]) {
  const totals = emptyUsageCounts()
  const daily = new Map<string, UsageDay>()
  const byModel = new Map<string, UsageModelTotals>()
  for (const row of rows) {
    const day = daily.get(row.date) ?? { ...emptyUsageCounts(), date: row.date }
    const key = usageModelKey(row)
    const model = byModel.get(key) ?? { ...emptyUsageCounts(), providerId: row.providerId, modelId: row.modelId }
    for (const target of [totals, day, model]) {
      target.inputTokens += row.inputTokens
      target.outputTokens += row.outputTokens
      target.cacheReadTokens += row.cacheReadTokens
      target.cacheWriteTokens += row.cacheWriteTokens
      target.totalTokens += row.totalTokens
      target.recordCount += row.recordCount
    }
    daily.set(row.date, day)
    byModel.set(key, model)
  }
  const days = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))
  const models = [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens || usageModelKey(a).localeCompare(usageModelKey(b)))
  return { totals, days, models, activeDays: days.filter(day => day.recordCount > 0).length }
}

export function createUsageModelDistribution(models: readonly UsageModelTotals[]) {
  const total = models.reduce((sum, model) => sum + model.totalTokens, 0)
  const groups = models.length > 6
    ? [...models.slice(0, 5).map(model => [model]), models.slice(5)]
    : models.map(model => [model])
  return groups.map((members) => {
    const totalTokens = members.reduce((sum, model) => sum + model.totalTokens, 0)
    const share = total ? totalTokens / total : 0
    return { key: members.length > 1 ? 'other' : usageModelKey(members[0]!), members, totalTokens, share }
  })
}

export function usageCalendarColumns(width: number, weekCount: number): number {
  const total = Math.max(53, weekCount)
  if (width <= 0)
    return total
  const capacity = Math.max(1, Math.floor((width - 44) / 14))
  return Math.ceil(total / Math.ceil(total / capacity))
}

export function localUsageDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function shiftUsageDate(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
}

export function usageDateRange(period: 'recent' | number, today: string) {
  if (period === 'recent')
    return { startDate: shiftUsageDate(today, -364), endDate: today }
  return { startDate: `${period}-01-01`, endDate: period === Number(today.slice(0, 4)) ? today : `${period}-12-31` }
}

export interface UsageCalendarCell {
  date: string
  inRange: boolean
  level: number
  usage: UsageDay | null
}

export function createUsageCalendar(startDate: string, endDate: string, days: readonly UsageDay[]) {
  const byDate = new Map(days.map(day => [day.date, day]))
  const peak = Math.max(0, ...days.map(day => day.totalTokens))
  const firstDate = shiftUsageDate(startDate, -new Date(startDate).getUTCDay())
  const lastDate = shiftUsageDate(endDate, 6 - new Date(endDate).getUTCDay())
  const weeks: UsageCalendarCell[][] = []
  for (let date = firstDate; date <= lastDate; date = shiftUsageDate(date, 1)) {
    if (new Date(date).getUTCDay() === 0)
      weeks.push([])
    const usage = byDate.get(date) ?? null
    weeks.at(-1)!.push({
      date,
      inRange: date >= startDate && date <= endDate,
      level: !usage ? -1 : usage.totalTokens === 0 ? 0 : Math.ceil(Math.sqrt(usage.totalTokens / peak) * 4),
      usage,
    })
  }
  return weeks
}

export function formatUsageNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language, { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}
