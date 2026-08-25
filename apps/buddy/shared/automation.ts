import { z } from 'zod'

import {
  BUDDY_DEFAULT_EXECUTION_PROFILE,
  BUDDY_EXECUTION_PROFILES,
} from './executionProfile'
import { BUDDY_THINKING_LEVELS } from './modelSelection'

export const AUTOMATION_LIFECYCLE_STATUSES = [
  'active',
  'paused',
  'blocked',
  'completed',
] as const

export const AUTOMATION_OCCURRENCE_STATUSES = [
  'queued',
  'bound',
  'skipped',
  'expired',
  'cancelled',
] as const

export const AUTOMATION_TRIGGER_KINDS = ['scheduled', 'manual'] as const
export const AUTOMATION_STARTUP_REASONS = ['normal', 'data_restore'] as const

export const AUTOMATION_BLOCKED_REASONS = [
  'AUTOMATION_PROJECT_UNAVAILABLE',
  'AUTOMATION_PINNED_MODEL_UNAVAILABLE',
] as const

export const AUTOMATION_ERROR_CODES = [
  'AUTOMATION_CONFLICT',
  'AUTOMATION_NOT_FOUND',
  'AUTOMATION_INVALID_SCHEDULE',
  'AUTOMATION_PROJECT_UNAVAILABLE',
  'AUTOMATION_PINNED_MODEL_UNAVAILABLE',
  'AUTOMATION_DEFAULT_MODEL_UNAVAILABLE',
  'AUTOMATION_APPROVAL_EXPIRED',
  'AUTOMATION_RUN_TIMEOUT',
  'OVERLAP_SKIPPED',
  'MISSED_WINDOW_EXCEEDED',
  'DATA_RESTORE_SKIPPED',
  'RUNTIME_RESTARTED',
] as const

export const AUTOMATION_EFFECTIVE_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
  'skipped',
  'expired',
] as const

export const AUTOMATION_PREVIEW_SAMPLE_LIMIT = 5
export const AUTOMATION_EXECUTION_SNAPSHOT_MAX_BYTES = 48 * 1024
export const AUTOMATION_PROMPT_MAX_BYTES = 32 * 1024

const idSchema = z.string().trim().min(1).max(256)
const localDateSchema = z.iso.date()
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const utcInstantSchema = z.iso.datetime()
const weekdaySchema = z.number().int().min(1).max(7)
const weekdaysSchema = z.array(weekdaySchema).min(1).max(7)

const timezoneSchema = z.string().trim().refine(isIanaTimezone)
const automationNameSchema = z.string().trim().refine(
  value => unicodeLength(value) >= 1 && unicodeLength(value) <= 80,
)

const dailyScheduleSchema = z.object({
  cadence: z.literal('daily'),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
}).strict()

const weeklyScheduleSchema = z.object({
  cadence: z.literal('weekly'),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
  weekdays: weekdaysSchema,
}).strict()

const monthlyScheduleSchema = z.object({
  cadence: z.literal('monthly'),
  dayOfMonth: z.union([z.number().int().min(1).max(31), z.literal('last')]),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
}).strict()

const yearlyScheduleSchema = z.object({
  cadence: z.literal('yearly'),
  day: z.number().int().min(1).max(31),
  kind: z.literal('calendar'),
  localTime: localTimeSchema,
  month: z.number().int().min(1).max(12),
}).strict().refine(
  value => value.day <= daysInMonthForSchedule(value.month),
  { path: ['day'] },
)

const hourlyIntervalScheduleSchema = z.object({
  anchorAt: utcInstantSchema,
  every: z.number().min(1).max(168).multipleOf(0.1),
  kind: z.literal('interval'),
  unit: z.literal('hour'),
}).strict()

const dailyIntervalScheduleSchema = z.object({
  anchorAt: utcInstantSchema,
  every: z.number().int().min(1).max(365),
  kind: z.literal('interval'),
  unit: z.literal('day'),
}).strict()

const onceScheduleSchema = z.object({
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

export const automationModelTargetSchema = z.union([
  z.object({ mode: z.literal('default') }).strict(),
  z.object({
    mode: z.literal('pinned'),
    modelId: idSchema,
    providerId: idSchema,
    reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  }).strict(),
])

const automationDefinitionShape = {
  executionProfile: z.enum(BUDDY_EXECUTION_PROFILES).default(BUDDY_DEFAULT_EXECUTION_PROFILE),
  model: automationModelTargetSchema,
  name: automationNameSchema,
  projectId: idSchema.nullable(),
  prompt: z.string().trim().refine(value => (
    value.length > 0 && new TextEncoder().encode(value).byteLength <= AUTOMATION_PROMPT_MAX_BYTES
  )),
  timing: automationTimingSchema,
} as const

export const automationDefinitionDraftSchema = z.object(automationDefinitionShape).strict()

export const automationExecutionSnapshotSchema = z.object(automationDefinitionShape).strict().refine(value => (
  new TextEncoder().encode(JSON.stringify(value)).byteLength
    <= AUTOMATION_EXECUTION_SNAPSHOT_MAX_BYTES
))

export const automationLifecycleStatusSchema = z.enum(AUTOMATION_LIFECYCLE_STATUSES)
export const automationOccurrenceStatusSchema = z.enum(AUTOMATION_OCCURRENCE_STATUSES)
export const automationTriggerKindSchema = z.enum(AUTOMATION_TRIGGER_KINDS)
export const automationErrorCodeSchema = z.enum(AUTOMATION_ERROR_CODES)
export const automationBlockedReasonSchema = z.enum(AUTOMATION_BLOCKED_REASONS)

export const automationSchema = z.object({
  ...automationDefinitionShape,
  blockedReason: automationBlockedReasonSchema.nullable(),
  createdAt: utcInstantSchema,
  id: idSchema,
  lastRunAt: utcInstantSchema.nullable(),
  nextRunAt: utcInstantSchema.nullable(),
  revision: z.number().int().positive(),
  status: automationLifecycleStatusSchema,
  updatedAt: utcInstantSchema,
}).strict().superRefine((automation, context) => {
  if ((automation.status === 'blocked') !== (automation.blockedReason !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['blockedReason'],
    })
  }
  if ((automation.status === 'active') !== (automation.nextRunAt !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['nextRunAt'],
    })
  }
})

export const automationOccurrenceSchema = z.object({
  automationId: idSchema,
  automationRevision: z.number().int().positive(),
  boundAt: utcInstantSchema.nullable(),
  coalescedMissedCount: z.number().int().nonnegative(),
  conversationId: idSchema.nullable(),
  errorCode: automationErrorCodeSchema.nullable(),
  errorSummary: z.string().refine(value => unicodeLength(value) <= 512).nullable(),
  finishedAt: utcInstantSchema.nullable(),
  id: idSchema,
  queuedAt: utcInstantSchema,
  runId: idSchema.nullable(),
  scheduledFor: utcInstantSchema,
  status: automationOccurrenceStatusSchema,
  triggerKind: automationTriggerKindSchema,
}).strict()

export const automationRunNowResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    occurrence: automationOccurrenceSchema,
    outcome: z.literal('started'),
  }).strict(),
  z.object({
    occurrence: automationOccurrenceSchema,
    outcome: z.literal('already_running'),
  }).strict(),
])

export const automationEffectiveStatusSchema = z.enum(AUTOMATION_EFFECTIVE_STATUSES)

export const automationOccurrenceViewSchema = automationOccurrenceSchema.extend({
  automationName: automationNameSchema,
  effectiveStatus: automationEffectiveStatusSchema,
  pendingApprovalCount: z.number().int().nonnegative(),
  run: z.object({
    completedAt: utcInstantSchema.nullable(),
    errorCode: z.string().max(256).nullable(),
    startedAt: utcInstantSchema,
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  }).strict().nullable(),
}).strict()

export const automationTaskSchema = automationSchema.safeExtend({
  activeOccurrence: automationOccurrenceViewSchema.nullable(),
}).strict()

const automationRequestIdSchema = z.string().trim().min(1).max(128)
const automationMutationTargetShape = {
  automationId: idSchema,
  expectedRevision: z.number().int().positive(),
  requestId: automationRequestIdSchema,
} as const

export const automationMutationRequestSchemas = {
  create: z.object({
    draft: automationDefinitionDraftSchema,
    requestId: automationRequestIdSchema,
  }).strict(),
  delete: z.object(automationMutationTargetShape).strict(),
  pause: z.object(automationMutationTargetShape).strict(),
  resume: z.object(automationMutationTargetShape).strict(),
  runNow: z.object(automationMutationTargetShape).strict(),
  update: z.object({
    ...automationMutationTargetShape,
    draft: automationDefinitionDraftSchema,
  }).strict(),
} as const

export const automationRequestSchemas = {
  deleteOccurrence: z.object({ occurrenceId: idSchema }).strict(),
  get: z.object({ automationId: idSchema }).strict(),
  list: z.object({
    cursor: z.string().regex(/^[\w-]+$/).max(2_048).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    statuses: z.array(automationLifecycleStatusSchema).max(4).optional(),
  }).strict(),
  listOccurrences: z.object({
    automationId: idSchema.nullable().optional(),
    cursor: z.string().regex(/^[\w-]+$/).max(2_048).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
} as const

export const automationPageSchema = z.object({
  items: z.array(automationTaskSchema),
  nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
}).strict()

export const automationOccurrencePageSchema = z.object({
  items: z.array(automationOccurrenceViewSchema),
  nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
}).strict()

export const automationChangedNotificationSchema = z.object({
  automationId: idSchema,
}).strict()

export const automationStartupContextSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('normal'), restoreToken: z.null() }).strict(),
  z.object({
    reason: z.literal('data_restore'),
    restoreToken: z.string().trim().min(1).max(512),
  }).strict(),
])

const calendarFrequencySchemas = [
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

const validAutomationPreviewResultSchema = z.object({
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
export type AutomationModelTarget = z.infer<typeof automationModelTargetSchema>
export type AutomationDefinitionDraft = z.infer<typeof automationDefinitionDraftSchema>
export type AutomationExecutionSnapshot = z.infer<typeof automationExecutionSnapshotSchema>
export type Automation = z.infer<typeof automationSchema>
export type AutomationOccurrence = z.infer<typeof automationOccurrenceSchema>
export type AutomationOccurrenceView = z.infer<typeof automationOccurrenceViewSchema>
export type AutomationRunNowResult = z.infer<typeof automationRunNowResultSchema>
export type AutomationTask = z.infer<typeof automationTaskSchema>
export type AutomationEffectiveStatus = z.infer<typeof automationEffectiveStatusSchema>
export type AutomationErrorCode = z.infer<typeof automationErrorCodeSchema>
export type AutomationBlockedReason = z.infer<typeof automationBlockedReasonSchema>
export type AutomationFrequency = z.infer<typeof automationFrequencySchema>
export type AutomationPreviewRequest = z.infer<typeof automationPreviewRequestSchema>
export type AutomationPreviewResult = z.infer<typeof automationPreviewResultSchema>
export type AutomationStartupContext = z.infer<typeof automationStartupContextSchema>
export type CreateAutomationRequest = z.infer<typeof automationMutationRequestSchemas.create>
export type UpdateAutomationRequest = z.infer<typeof automationMutationRequestSchemas.update>
export type AutomationMutationTargetRequest
  = z.infer<typeof automationMutationRequestSchemas.pause>

function daysInMonthForSchedule(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

function isIanaTimezone(value: string): boolean {
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

function unicodeLength(value: string): number {
  return Array.from(value).length
}
