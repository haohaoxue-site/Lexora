import type { BuddyComposerResource } from '@buddy-shared/conversation/composerResource'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'

import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import { resolveModelConfigurationIssue } from '@/modules/models'

export type ChatComposerModelInputIssue = 'reasoning_unsupported' | 'service_tier_unsupported' | null

export function resolveChatComposerModelInputIssue(input: {
  model: LocalRuntimeModelOption | null
  modelSelection?: { reasoning: BuddyThinkingLevel | null, serviceTier: BuddyServiceTier | null } | null
  resourceIds: readonly string[]
  resources: readonly { resource: Pick<BuddyComposerResource, 'kind' | 'mimeType' | 'resourceId'> }[]
}): ChatComposerModelInputIssue {
  if (!input.model)
    return null
  const configurationIssue = input.modelSelection ? resolveModelConfigurationIssue(input.model, input.modelSelection) : null
  if (configurationIssue)
    return configurationIssue
  return null
}
