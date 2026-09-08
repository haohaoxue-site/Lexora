import { z } from 'zod'
import { automationDefinitionDraftSchema, automationSchema } from './definition'
import { automationOccurrenceViewSchema } from './occurrences'
import { automationLifecycleStatusSchema, idSchema } from './primitives'

export const automationListItemSchema = automationSchema.safeExtend({
  activeOccurrence: automationOccurrenceViewSchema.nullable(),
}).strict()

export const automationRequestIdSchema = z.string().trim().min(1).max(128)

export const automationMutationTargetShape = {
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
  items: z.array(automationListItemSchema),
  nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
}).strict()

export const automationChangedNotificationSchema = z.object({
  automationId: idSchema,
}).strict()

export type AutomationListItem = z.infer<typeof automationListItemSchema>

export type CreateAutomationRequest = z.infer<typeof automationMutationRequestSchemas.create>

export type UpdateAutomationRequest = z.infer<typeof automationMutationRequestSchemas.update>

export type AutomationMutationTargetRequest
  = z.infer<typeof automationMutationRequestSchemas.pause>
