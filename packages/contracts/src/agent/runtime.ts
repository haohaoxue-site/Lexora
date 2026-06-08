import { z } from 'zod'
import {
  AiProviderAuthModeSchema,
  AiProviderScopeSchema,
} from '../ai'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AgentRuntimeModelTargetSchema = z.object({
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
  providerKey: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpoint: NonEmptyStringSchema,
  apiKey: NonEmptyStringSchema.nullable(),
  authMode: AiProviderAuthModeSchema,
  modelId: NonEmptyStringSchema,
}).strict()

export type AgentRuntimeModelTarget = z.infer<typeof AgentRuntimeModelTargetSchema>
