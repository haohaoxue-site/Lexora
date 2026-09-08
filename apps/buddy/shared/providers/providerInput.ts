import { z } from 'zod'
import { BUDDY_THINKING_LEVELS } from '../conversation/modelSelection'
import { isSecureOrLoopbackHttpUrl } from '../network/networkSecurity'

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

export const defaultModelSchema = z.object({
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
}).strict()

export const providerModelInputSchema = customProviderModelSchema

export type CustomProviderInput = z.input<typeof customProviderInputSchema>

export type ParsedCustomProviderInput = z.output<typeof customProviderInputSchema>

export type BuddyDefaultModel = z.infer<typeof defaultModelSchema>

export type ProviderModelInput = z.input<typeof providerModelInputSchema>
