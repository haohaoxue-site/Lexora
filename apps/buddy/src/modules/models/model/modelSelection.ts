import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'

import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import { BUDDY_DEFAULT_THINKING_LEVEL } from '@buddy-shared/conversation/modelSelection'

export function modelKey(model: Pick<LocalRuntimeModelOption, 'modelId' | 'providerId'>): string {
  return `${model.providerId}:${model.modelId}`
}

export function resolveConcreteEffort(
  model: LocalRuntimeModelOption,
  requested: BuddyThinkingLevel | null,
): BuddyThinkingLevel | null {
  if (!model.reasoningOptions.length)
    return null
  if (requested && model.reasoningOptions.includes(requested))
    return requested
  if (model.reasoningOptions.includes(BUDDY_DEFAULT_THINKING_LEVEL))
    return BUDDY_DEFAULT_THINKING_LEVEL
  return model.reasoningOptions.find(level => level !== 'off') ?? model.reasoningOptions[0] ?? null
}

export function resolveModelConfigurationIssue(
  model: LocalRuntimeModelOption,
  selection: { reasoning: BuddyThinkingLevel | null, serviceTier: BuddyServiceTier | null },
): 'reasoning_unsupported' | 'service_tier_unsupported' | null {
  if (selection.reasoning !== null && !model.reasoningOptions.includes(selection.reasoning))
    return 'reasoning_unsupported'
  if (selection.serviceTier !== null && !model.serviceTiers.some(tier => tier.id === selection.serviceTier))
    return 'service_tier_unsupported'
  return null
}
