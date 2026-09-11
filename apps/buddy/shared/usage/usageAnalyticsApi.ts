import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema, timestampSchema } from '../runtime/apiValidation'

export const USAGE_TOP_TASKS_LIMIT = 5

const dateSchema = z.iso.date()
const timeZoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    return !!new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone
  }
  catch {
    return false
  }
}, 'Invalid time zone')

export const usagePeriodSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  timeZone: timeZoneSchema,
}).strict().refine(({ startDate, endDate }) => {
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000
  return days >= 0 && days < 366
}, 'Usage periods must contain between 1 and 366 days')

export const usageTrendRequestSchema = usagePeriodSchema.safeExtend({
  granularity: z.enum(['hour', 'day']),
}).refine(input => input.granularity !== 'hour' || input.startDate === input.endDate, 'Hourly usage must cover a single local day')

export const usageTrendSchema = z.array(z.object({
  startAt: timestampSchema,
  endAt: timestampSchema,
  totalTokens: z.number().int().nonnegative().nullable(),
  recordCount: z.number().int().nonnegative(),
}).strict()).max(366)

export const usageModelSchema = z.object({
  providerId: idSchema,
  modelId: idSchema,
}).strict()

export const usageTopTasksRequestSchema = usagePeriodSchema.safeExtend({
  model: usageModelSchema.nullable(),
})

export const usageCountsSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
}).strict()

const usageModelDaySchema = usageCountsSchema.extend({
  date: dateSchema,
  providerId: idSchema,
  modelId: idSchema,
})

export const usageAnalyticsSchema = z.object({
  days: z.array(usageModelDaySchema),
  firstRecordedAt: timestampSchema.nullable(),
}).strict()

export const usageTopTasksSchema = z.array(z.object({
  conversationId: idSchema,
  title: z.string().nullable(),
  spaceName: z.string().nullable(),
  totalTokens: z.number().int().nonnegative(),
  recordCount: z.number().int().positive(),
}).strict()).max(USAGE_TOP_TASKS_LIMIT)

export type UsagePeriod = z.infer<typeof usagePeriodSchema>
export type UsageTrendRequest = z.infer<typeof usageTrendRequestSchema>
export type LocalUsageTrend = DeepReadonly<z.infer<typeof usageTrendSchema>>
export type UsageModel = z.infer<typeof usageModelSchema>
export type UsageTopTasksRequest = z.infer<typeof usageTopTasksRequestSchema>
export type UsageCounts = z.infer<typeof usageCountsSchema>
export type LocalUsageAnalytics = DeepReadonly<z.infer<typeof usageAnalyticsSchema>>
export type LocalUsageModelDay = LocalUsageAnalytics['days'][number]
export type LocalUsageTopTasks = DeepReadonly<z.infer<typeof usageTopTasksSchema>>

export const usageAnalyticsRpc = {
  analytics: { method: 'usage.analytics', input: usagePeriodSchema, response: usageAnalyticsSchema },
  trend: { method: 'usage.trend', input: usageTrendRequestSchema, response: usageTrendSchema },
  topTasks: { method: 'usage.topTasks', input: usageTopTasksRequestSchema, response: usageTopTasksSchema },
} as const satisfies Record<string, RuntimeRequestContract>
