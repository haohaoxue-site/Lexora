import { z } from 'zod'
import { AUTOMATION_PREVIEW_SAMPLE_LIMIT, utcInstantSchema } from './primitives'

export const localDateSchema = z.iso.date()

export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const weekdaySchema = z.number().int().min(1).max(7)

export const weekdaysSchema = z.array(weekdaySchema).min(1).max(7)

export const timezoneSchema = z.string().trim().refine(isIanaTimezone)

export const dailyScheduleSchema = z.object({
  cadence: z.literal('daily'),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
}).strict()

export const weeklyScheduleSchema = z.object({
  cadence: z.literal('weekly'),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
  weekdays: weekdaysSchema,
}).strict()

export const monthlyScheduleSchema = z.object({
  cadence: z.literal('monthly'),
  dayOfMonth: z.union([z.number().int().min(1).max(31), z.literal('last')]),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
}).strict()

export const yearlyScheduleSchema = z.object({
  cadence: z.literal('yearly'),
  day: z.number().int().min(1).max(31),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
  month: z.number().int().min(1).max(12),
}).strict().refine(
  value => value.day <= daysInMonthForSchedule(value.month),
  { path: ['day'] },
)

export const hourlyIntervalScheduleSchema = z.object({
  anchorAt: utcInstantSchema,
  every: z.number().min(1).max(168).multipleOf(0.1),
  kind: z.literal('interval'),
  unit: z.literal('hour'),
}).strict()

export const dailyIntervalScheduleSchema = z.object({
  anchorAt: utcInstantSchema,
  every: z.number().int().min(1).max(365),
  kind: z.literal('interval'),
  unit: z.literal('day'),
}).strict()

export const onceScheduleSchema = z.object({
  kind: z.literal('once'),
  runAt: utcInstantSchema,
}).strict()

export const automationScheduleSchema = z.union([
  dailyScheduleSchema,
  weeklyScheduleSchema,
  monthlyScheduleSchema,
  yearlyScheduleSchema,
  hourlyIntervalScheduleSchema,
  dailyIntervalScheduleSchema,
  onceScheduleSchema,
])

export const automationTimingSchema = z.object({
  activeFrom: localDateSchema.nullable(),
  activeUntil: localDateSchema.nullable(),
  schedule: automationScheduleSchema,
  timezone: timezoneSchema,
}).strict().superRefine((timing, context) => {
  if (timing.activeFrom && timing.activeUntil && timing.activeFrom > timing.activeUntil) {
    context.addIssue({
      code: 'custom',
      path: ['activeUntil'],
    })
  }
  if (
    timing.schedule.kind === 'once'
    && (timing.activeFrom !== null || timing.activeUntil !== null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['activeFrom'],
    })
  }
})

export const calendarFrequencySchemas = [
  dailyScheduleSchema.extend({ timezone: timezoneSchema }),
  weeklyScheduleSchema.extend({ timezone: timezoneSchema }),
  monthlyScheduleSchema.extend({ timezone: timezoneSchema }),
  yearlyScheduleSchema.extend({ timezone: timezoneSchema }),
] as const

export const automationFrequencySchema = z.union([
  ...calendarFrequencySchemas,
  hourlyIntervalScheduleSchema.extend({ timezone: timezoneSchema }),
  dailyIntervalScheduleSchema.extend({ timezone: timezoneSchema }),
  onceScheduleSchema.extend({ timezone: timezoneSchema }),
])

export const automationPreviewRequestSchema = z.object({
  sampleCount: z.number().int().min(1).max(AUTOMATION_PREVIEW_SAMPLE_LIMIT).optional(),
  timing: z.unknown(),
}).strict()

export const automationPreviewIssueSchema = z.object({
  code: z.literal('AUTOMATION_INVALID_SCHEDULE'),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])).min(1),
}).strict()

export const validAutomationPreviewResultSchema = z.object({
  frequency: automationFrequencySchema,
  nextRunAt: utcInstantSchema.nullable(),
  normalizedTiming: automationTimingSchema,
  samples: z.array(utcInstantSchema).max(AUTOMATION_PREVIEW_SAMPLE_LIMIT),
  valid: z.literal(true),
}).strict().superRefine((result, context) => {
  if (result.nextRunAt !== (result.samples[0] ?? null)) {
    context.addIssue({
      code: 'custom',
      path: ['nextRunAt'],
    })
  }
})

export const automationPreviewResultSchema = z.discriminatedUnion('valid', [
  validAutomationPreviewResultSchema,
  z.object({
    issues: z.array(automationPreviewIssueSchema).min(1),
    valid: z.literal(false),
  }).strict(),
])

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>

export type AutomationTiming = z.infer<typeof automationTimingSchema>

export type AutomationFrequency = z.infer<typeof automationFrequencySchema>

export type AutomationPreviewRequest = z.infer<typeof automationPreviewRequestSchema>

export type AutomationPreviewResult = z.infer<typeof automationPreviewResultSchema>

export function daysInMonthForSchedule(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

export function isIanaTimezone(value: string): boolean {
  if (value !== 'UTC' && !value.includes('/'))
    return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
    return true
  }
  catch {
    return false
  }
}
