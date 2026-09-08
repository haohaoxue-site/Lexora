import { z } from 'zod'

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

export type BuddyProvider = z.infer<typeof buddyProviderSchema>
export type BuddyModel = z.infer<typeof buddyModelSchema>

export type ModelParametersOverride = z.infer<typeof modelParametersOverrideSchema>
export type ProviderAuthChallenge = z.infer<typeof providerAuthChallengeSchema>
