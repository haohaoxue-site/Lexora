import { z } from 'zod'
import { BUDDY_THINKING_LEVELS } from '../../../shared/modelSelection'
import { isSecureOrLoopbackHttpUrl } from '../../../shared/networkSecurity'

export const apiKeyCredentialSchema = z.object({
  type: z.literal('api_key'),
  key: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
}).strict()

export const oauthCredentialSchema = z.object({
  type: z.literal('oauth'),
  access: z.string(),
  refresh: z.string(),
  expires: z.number(),
}).loose()

export const credentialSchema = z.union([
  apiKeyCredentialSchema,
  oauthCredentialSchema,
])

export const DEFAULT_CUSTOM_MODEL_CONTEXT_WINDOW = 128_000
export const DEFAULT_CUSTOM_MODEL_MAX_TOKENS = 16_384

export const customProviderModelSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200).optional(),
  reasoning: z.boolean().default(false),
  input: z.array(z.enum(['text', 'image'])).min(1).default(['text']),
  cost: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
  }).strict().default({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
}).strict().transform(model => ({
  ...model,
  contextWindow: model.contextWindow ?? DEFAULT_CUSTOM_MODEL_CONTEXT_WINDOW,
  maxTokens: model.maxTokens ?? DEFAULT_CUSTOM_MODEL_MAX_TOKENS,
  name: model.name ?? model.id,
}))

export const customProviderInputSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  displayName: z.string().trim().min(1).max(100),
  description: z.string().trim().max(200).optional(),
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
  models: z.array(customProviderModelSchema).default([]),
  enabled: z.boolean().default(false),
}).strict().superRefine((provider, context) => {
  const modelIds = new Set<string>()
  for (const [index, model] of provider.models.entries()) {
    if (modelIds.has(model.id)) {
      context.addIssue({
        code: 'custom',
        message: 'Model identifiers must be unique within a provider',
        path: ['models', index, 'id'],
      })
    }
    modelIds.add(model.id)
    if (model.maxTokens > model.contextWindow) {
      context.addIssue({
        code: 'custom',
        message: 'Model max tokens cannot exceed its context window',
        path: ['models', index, 'maxTokens'],
      })
    }
  }
})

export const buddyProviderSchema = z.object({
  activeRunCount: z.number().int().nonnegative(),
  added: z.boolean(),
  api: z.string().nullable(),
  id: z.string(),
  displayName: z.string(),
  description: z.string().max(200).nullable(),
  baseUrl: z.string().nullable(),
  canSyncModels: z.boolean(),
  authTypes: z.array(z.enum(['api_key', 'oauth'])),
  storedCredentialType: z.enum(['api_key', 'oauth']).nullable(),
  status: z.enum(['available', 'authentication_required', 'unavailable']),
  custom: z.boolean(),
  enabled: z.boolean(),
  enabledModelCount: z.number().int().nonnegative(),
  modelCount: z.number().int().nonnegative(),
  setupComplete: z.boolean(),
  syncUnavailableReason: z.enum(['authentication_required', 'unsupported_api']).nullable(),
}).strict()

export const buddyModelSchema = z.object({
  available: z.boolean(),
  id: z.string(),
  displayName: z.string(),
  providerId: z.string(),
  api: z.string(),
  capabilities: z.array(z.enum(['text', 'image', 'reasoning'])),
  contextWindow: z.number().int(),
  hasParameterOverride: z.boolean(),
  maxTokens: z.number().int(),
  overrideContextWindow: z.number().int().positive().nullable(),
  overrideMaxTokens: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  lastSeenAt: z.string().nullable(),
  source: z.enum(['builtin', 'manual', 'synced']),
  sourceContextWindow: z.number().int().positive(),
  sourceMaxTokens: z.number().int().positive(),
  sourceParametersUpdated: z.boolean(),
}).strict()

export const modelParametersOverrideSchema = z.object({
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
}).strict().refine(value => value.maxTokens <= value.contextWindow)

export const defaultModelSchema = z.object({
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
}).strict()

export const providerModelInputSchema = customProviderModelSchema

export const providerAuthChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  providerId: z.string(),
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
  message: z.string().optional(),
  placeholder: z.string().optional(),
  url: z.string().optional(),
  instructions: z.string().optional(),
  userCode: z.string().optional(),
  verificationUri: z.string().optional(),
  intervalSeconds: z.number().optional(),
  expiresInSeconds: z.number().optional(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
  }).strict()).optional(),
  links: z.array(z.object({
    url: z.string(),
    label: z.string().optional(),
  }).strict()).optional(),
}).strict()

export type CustomProviderInput = z.input<typeof customProviderInputSchema>
export type ParsedCustomProviderInput = z.output<typeof customProviderInputSchema>
export type BuddyProvider = z.infer<typeof buddyProviderSchema>
export type BuddyModel = z.infer<typeof buddyModelSchema>
export type BuddyDefaultModel = z.infer<typeof defaultModelSchema>
export type ProviderModelInput = z.input<typeof providerModelInputSchema>
export type ModelParametersOverride = z.infer<typeof modelParametersOverrideSchema>
export type ProviderAuthChallenge = z.infer<typeof providerAuthChallengeSchema>
