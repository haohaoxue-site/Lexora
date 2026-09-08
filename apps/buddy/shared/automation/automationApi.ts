import type { RuntimeNotificationContract, RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { validationResponseSchemas } from '../runtime/apiValidation'
import { automationChangedNotificationSchema, automationMutationRequestSchemas, automationOccurrencePageSchema, automationOccurrenceSchema, automationPageSchema, automationPreviewRequestSchema, automationPreviewResultSchema, automationRequestSchemas, automationRunNowResultSchema, automationSchema } from './'

export type LocalAutomation = DeepReadonly<z.infer<typeof automationSchema>>

export type LocalAutomationOccurrence
  = DeepReadonly<z.infer<typeof automationOccurrenceSchema>>

export type LocalAutomationOccurrencePage
  = DeepReadonly<z.infer<typeof automationOccurrencePageSchema>>

export type LocalAutomationPage = DeepReadonly<z.infer<typeof automationPageSchema>>

export type LocalAutomationRunNowResult
  = DeepReadonly<z.infer<typeof automationRunNowResultSchema>>

export type LocalAutomationListItem = LocalAutomationPage['items'][number]

export type LocalAutomationCreateRequest = z.input<typeof automationsRequestSchemas.automationCreate>

export type LocalAutomationUpdateRequest = z.input<typeof automationsRequestSchemas.automationUpdate>

export type LocalAutomationMutationRequest = z.input<typeof automationsRequestSchemas.automationPause>

export type LocalAutomationListRequest = z.input<typeof automationsRequestSchemas.automationList>

export type LocalAutomationOccurrenceListRequest
  = z.input<typeof automationsRequestSchemas.automationListOccurrences>

export type LocalAutomationPreviewRequest
  = DeepReadonly<z.infer<typeof automationPreviewRequestSchema>>

export type LocalAutomationPreviewResult
  = DeepReadonly<z.infer<typeof automationPreviewResultSchema>>

export const automationsRequestSchemas = {
  automationChanged: automationChangedNotificationSchema,
  automationCreate: automationMutationRequestSchemas.create,
  automationDelete: automationMutationRequestSchemas.delete,
  automationDeleteOccurrence: automationRequestSchemas.deleteOccurrence,
  automationGet: automationRequestSchemas.get,
  automationList: automationRequestSchemas.list,
  automationListOccurrences: automationRequestSchemas.listOccurrences,
  automationPause: automationMutationRequestSchemas.pause,
  automationPreview: automationPreviewRequestSchema,
  automationResume: automationMutationRequestSchemas.resume,
  automationRunNow: automationMutationRequestSchemas.runNow,
  automationUpdate: automationMutationRequestSchemas.update,
} as const

export const automationsResponseSchemas = {
  automationPreview: automationPreviewResultSchema,
  automation: automationSchema,
  automationOccurrence: automationOccurrenceSchema,
  automationOccurrencePage: automationOccurrencePageSchema,
  automationPage: automationPageSchema,
  automationRunNowResult: automationRunNowResultSchema,
} as const

export const automationsRpc = {
  preview: { method: 'automations.preview', input: automationsRequestSchemas.automationPreview, response: automationsResponseSchemas.automationPreview },
  list: { method: 'automations.list', input: automationsRequestSchemas.automationList, response: automationsResponseSchemas.automationPage },
  get: { method: 'automations.get', input: automationsRequestSchemas.automationGet, response: automationsResponseSchemas.automation },
  create: { method: 'automations.create', input: automationsRequestSchemas.automationCreate, response: automationsResponseSchemas.automation },
  update: { method: 'automations.update', input: automationsRequestSchemas.automationUpdate, response: automationsResponseSchemas.automation },
  pause: { method: 'automations.pause', input: automationsRequestSchemas.automationPause, response: automationsResponseSchemas.automation },
  resume: { method: 'automations.resume', input: automationsRequestSchemas.automationResume, response: automationsResponseSchemas.automation },
  delete: { method: 'automations.delete', input: automationsRequestSchemas.automationDelete, response: automationsResponseSchemas.automation },
  deleteOccurrence: { method: 'automations.deleteOccurrence', input: automationsRequestSchemas.automationDeleteOccurrence, response: validationResponseSchemas.deleted },
  runNow: { method: 'automations.runNow', input: automationsRequestSchemas.automationRunNow, response: automationsResponseSchemas.automationRunNowResult },
  listOccurrences: { method: 'automations.listOccurrences', input: automationsRequestSchemas.automationListOccurrences, response: automationsResponseSchemas.automationOccurrencePage },
} as const satisfies Record<string, RuntimeRequestContract>

export const automationNotifications = {
  changed: { method: 'automation.changed', params: automationChangedNotificationSchema },
  wake: { method: 'scheduler.wake', params: z.object({ reason: z.enum(['resume', 'unlock-screen']) }).strict() },
} as const satisfies Record<string, RuntimeNotificationContract>
