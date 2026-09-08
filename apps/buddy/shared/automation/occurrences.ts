import { z } from 'zod'
import { automationEffectiveStatusSchema, automationErrorCodeSchema, automationNameSchema, automationOccurrenceStatusSchema, automationTriggerKindSchema, idSchema, unicodeLength, utcInstantSchema } from './primitives'

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

export const automationOccurrencePageSchema = z.object({
  items: z.array(automationOccurrenceViewSchema),
  nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
}).strict()

export type AutomationOccurrence = z.infer<typeof automationOccurrenceSchema>

export type AutomationOccurrenceView = z.infer<typeof automationOccurrenceViewSchema>

export type AutomationRunNowResult = z.infer<typeof automationRunNowResultSchema>
