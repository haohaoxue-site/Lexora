import { z } from 'zod'

export const buddyReasoningKindSchema = z.enum(['summary', 'thinking'])

export type BuddyReasoningKind = z.infer<typeof buddyReasoningKindSchema>

const SUMMARY_APIS = new Set([
  'azure-openai-responses',
  'openai-codex-responses',
  'openai-responses',
])

const SUMMARY_PROVIDERS = new Set([
  'azure-openai',
  'openai',
  'openai-codex',
])

export function resolveBuddyReasoningKind(input: {
  api?: string | null
  provider?: string | null
  reasoningKind?: BuddyReasoningKind | null
}): BuddyReasoningKind {
  if (input.reasoningKind)
    return input.reasoningKind
  if (input.api)
    return SUMMARY_APIS.has(input.api) ? 'summary' : 'thinking'
  return input.provider && SUMMARY_PROVIDERS.has(input.provider)
    ? 'summary'
    : 'thinking'
}
