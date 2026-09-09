import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'

export const runTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict()

export type LocalRunTokenUsage = DeepReadonly<z.infer<typeof runTokenUsageSchema>>

export function summarizeRunTokenUsage(usage: LocalRunTokenUsage) {
  const inputTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  return {
    inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cacheReadTokens,
    cacheHitRate: inputTokens > 0 ? usage.cacheReadTokens / inputTokens : null,
  }
}
