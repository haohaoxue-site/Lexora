import type { RuntimeNotificationContract, RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { BUDDY_SERVICE_TIERS, BUDDY_THINKING_LEVELS } from '../conversation/modelSelection'
import { isSecureOrLoopbackHttpUrl } from '../network/networkSecurity'
import { idSchema, timestampSchema, validationRequestSchemas, validationResponseSchemas } from '../runtime/apiValidation'
import { customProviderInputSchema, defaultModelSchema, providerModelInputSchema } from './providerInput'

export const providerSchema = z.object({
  activeRunCount: z.number().int().nonnegative(),
  added: z.boolean(),
  api: z.string().nullable(),
  authTypes: z.array(z.enum(['api_key', 'oauth'])),
  baseUrl: z.string().nullable(),
  canSyncModels: z.boolean(),
  custom: z.boolean(),
  description: z.string().max(200).nullable(),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  enabledModelCount: z.number().int().nonnegative(),
  id: idSchema,
  modelCount: z.number().int().nonnegative(),
  setupComplete: z.boolean(),
  status: z.enum(['available', 'authentication_required', 'unavailable']),
  storedCredentialType: z.enum(['api_key', 'oauth']).nullable(),
  syncUnavailableReason: z.enum(['authentication_required', 'unsupported_api']).nullable(),
}).strict()

export const modelSchema = z.object({
  available: z.boolean(),
  capabilities: z.array(z.string().min(1)),
  contextWindow: z.number().int().positive(),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  hasParameterOverride: z.boolean(),
  lastSeenAt: timestampSchema.nullable(),
  maxTokens: z.number().int().positive(),
  modelId: idSchema,
  overrideContextWindow: z.number().int().positive().nullable(),
  overrideMaxTokens: z.number().int().positive().nullable(),
  providerId: idSchema,
  reasoningOptions: z.array(z.enum(BUDDY_THINKING_LEVELS)),
  serviceTiers: z.array(z.object({
    displayName: z.string().min(1),
    id: z.enum(BUDDY_SERVICE_TIERS),
  }).strict()),
  source: z.enum(['builtin', 'manual', 'synced']),
  sourceContextWindow: z.number().int().positive(),
  sourceMaxTokens: z.number().int().positive(),
  sourceParametersUpdated: z.boolean(),
}).strict().superRefine((model, context) => {
  const hasOverridePair = model.overrideContextWindow !== null && model.overrideMaxTokens !== null
  const hasPartialOverride = (model.overrideContextWindow === null) !== (model.overrideMaxTokens === null)
  if (hasPartialOverride || model.hasParameterOverride !== hasOverridePair) {
    context.addIssue({
      code: 'custom',
      message: 'Model parameter overrides must be present as one atomic pair',
      path: ['hasParameterOverride'],
    })
  }
  if (model.sourceMaxTokens > model.sourceContextWindow) {
    context.addIssue({
      code: 'custom',
      message: 'Source max tokens cannot exceed the source context window',
      path: ['sourceMaxTokens'],
    })
  }
  const effectiveContextWindow = model.overrideContextWindow ?? model.sourceContextWindow
  const effectiveMaxTokens = model.overrideMaxTokens ?? model.sourceMaxTokens
  if (
    model.contextWindow !== effectiveContextWindow
    || model.maxTokens !== effectiveMaxTokens
    || effectiveMaxTokens > effectiveContextWindow
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Effective model parameters must match the override or source pair',
      path: ['contextWindow'],
    })
  }
})

export const modelParametersOverrideSchema = z.object({
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
}).strict().refine(value => value.maxTokens <= value.contextWindow)

export const customProviderModelSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  id: z.string().trim().min(1).max(200),
  input: z.array(z.enum(['text', 'image'])).min(1),
  maxTokens: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  reasoning: z.boolean(),
}).strict().refine(model => (
  model.maxTokens === undefined
  || model.contextWindow === undefined
  || model.maxTokens <= model.contextWindow
))

export const customProviderSchema = z.object({
  api: z.enum([
    'anthropic-messages',
    'azure-openai-responses',
    'bedrock-converse-stream',
    'google-generative-ai',
    'google-vertex',
    'mistral-conversations',
    'openai-codex-responses',
    'openai-completions',
    'openai-responses',
    'pi-messages',
  ]),
  baseUrl: z.url().refine(isSecureOrLoopbackHttpUrl),
  description: z.string().trim().max(200).optional(),
  displayName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  models: z.array(customProviderModelSchema).default([]),
}).strict().superRefine((provider, context) => {
  const ids = new Set<string>()
  for (const [index, model] of provider.models.entries()) {
    if (ids.has(model.id)) {
      context.addIssue({
        code: 'custom',
        message: 'Model identifiers must be unique',
        path: ['models', index, 'id'],
      })
    }
    ids.add(model.id)
  }
})

export const providerAuthChallengeSchema = z.object({
  challengeId: z.uuid(),
  expiresInSeconds: z.number().positive().optional(),
  instructions: z.string().optional(),
  intervalSeconds: z.number().positive().optional(),
  links: z.array(z.object({
    label: z.string().optional(),
    url: z.url(),
  }).strict()).optional(),
  message: z.string().optional(),
  options: z.array(z.object({
    description: z.string().optional(),
    id: z.string(),
    label: z.string(),
  }).strict()).optional(),
  placeholder: z.string().optional(),
  providerId: idSchema,
  type: z.enum([
    'auth_url',
    'device_code',
    'info',
    'manual_code',
    'progress',
    'secret',
    'select',
    'text',
  ]),
  url: z.url().optional(),
  userCode: z.string().optional(),
  verificationUri: z.url().optional(),
}).strict()

export const defaultModelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
}).strict()

export type LocalCustomProvider = z.input<typeof customProviderSchema>

export type LocalCustomProviderModel = z.input<typeof customProviderModelSchema>

export type LocalDefaultModel = DeepReadonly<z.infer<typeof defaultModelSelectionSchema>>

export type LocalProvider = DeepReadonly<z.infer<typeof providerSchema>>

export type LocalProviderAuthChallenge = DeepReadonly<z.infer<typeof providerAuthChallengeSchema>>

export type LocalRuntimeModelOption = DeepReadonly<z.infer<typeof modelSchema>>

export const providersRequestSchemas = {
  listModels: z.object({ providerId: z.string().nullable().optional() }).strict(),
  providerAuthCancel: z.object({ challengeId: z.uuid() }).strict(),
  providerAuthResponse: z.object({
    challengeId: z.uuid(),
    value: z.string().max(64 * 1024),
  }).strict(),
  providerId: z.object({ providerId: idSchema }).strict(),
  providerEnabled: z.object({
    enabled: z.boolean(),
    providerId: idSchema,
  }).strict(),
  providerLogin: z.object({
    authType: z.enum(['api_key', 'oauth']),
    providerId: idSchema,
  }).strict(),
  providerManualModel: z.object({
    model: customProviderModelSchema,
    providerId: idSchema,
  }).strict(),
  providerModel: z.object({
    modelId: idSchema,
    providerId: idSchema,
  }).strict(),
  providerModelParameters: z.object({
    modelId: idSchema,
    parameters: modelParametersOverrideSchema,
    providerId: idSchema,
  }).strict(),
  providerModelEnabled: z.object({
    enabled: z.boolean(),
    modelId: idSchema,
    providerId: idSchema,
  }).strict(),
  providerUpsert: z.object({ provider: customProviderSchema }).strict(),
  defaultModel: z.object({
    model: defaultModelSelectionSchema.nullable(),
  }).strict(),
} as const

export const providersResponseSchemas = {
  model: modelSchema,
  models: z.array(modelSchema),
  optionalDefaultModel: defaultModelSelectionSchema.nullable(),
  provider: providerSchema,
  providerAuthChallenge: providerAuthChallengeSchema,
  providers: z.array(providerSchema),
} as const

export const providersRpc = {
  list: { method: 'providers.list', input: validationRequestSchemas.empty, response: providersResponseSchemas.providers },
  add: { method: 'providers.add', input: providersRequestSchemas.providerId, response: providersResponseSchemas.provider },
  listModels: { method: 'providers.listModels', input: z.object({ providerId: idSchema.nullable().optional() }).strict(), response: providersResponseSchemas.models },
  getDefaultModel: { method: 'providers.getDefaultModel', input: validationRequestSchemas.empty, response: providersResponseSchemas.optionalDefaultModel },
  login: { method: 'providers.login', input: providersRequestSchemas.providerLogin, response: validationResponseSchemas.mutation },
  respondToAuth: { method: 'providers.respondToAuth', input: z.object({ challengeId: z.uuid(), value: z.string() }).strict(), response: validationResponseSchemas.mutation },
  cancelAuth: { method: 'providers.cancelAuth', input: providersRequestSchemas.providerAuthCancel, response: validationResponseSchemas.mutation },
  logout: { method: 'providers.logout', input: providersRequestSchemas.providerId, response: validationResponseSchemas.mutation },
  clearCredential: { method: 'providers.clearCredential', input: providersRequestSchemas.providerId, response: validationResponseSchemas.mutation },
  remove: { method: 'providers.remove', input: providersRequestSchemas.providerId, response: validationResponseSchemas.mutation },
  setEnabled: { method: 'providers.setEnabled', input: providersRequestSchemas.providerEnabled, response: providersResponseSchemas.provider },
  setModelEnabled: { method: 'providers.setModelEnabled', input: providersRequestSchemas.providerModelEnabled, response: providersResponseSchemas.model },
  setModelParameters: { method: 'providers.setModelParameters', input: providersRequestSchemas.providerModelParameters, response: providersResponseSchemas.model },
  acknowledgeModelSourceUpdate: { method: 'providers.acknowledgeModelSourceUpdate', input: providersRequestSchemas.providerModel, response: providersResponseSchemas.model },
  restoreModelSourceParameters: { method: 'providers.restoreModelSourceParameters', input: providersRequestSchemas.providerModel, response: providersResponseSchemas.model },
  setDefaultModel: { method: 'providers.setDefaultModel', input: z.object({ model: defaultModelSchema.nullable() }).strict(), response: providersResponseSchemas.optionalDefaultModel },
  syncModels: { method: 'providers.syncModels', input: providersRequestSchemas.providerId, response: providersResponseSchemas.models },
  upsertManualModel: { method: 'providers.upsertManualModel', input: z.object({ model: providerModelInputSchema, providerId: idSchema }).strict(), response: providersResponseSchemas.model },
  upsertCustom: { method: 'providers.upsertCustom', input: customProviderInputSchema, response: providersResponseSchemas.provider },
} as const satisfies Record<string, RuntimeRequestContract>

export const providerNotifications = {
  authChallenge: { method: 'providers.authChallenge', params: providerAuthChallengeSchema },
} as const satisfies Record<string, RuntimeNotificationContract>
