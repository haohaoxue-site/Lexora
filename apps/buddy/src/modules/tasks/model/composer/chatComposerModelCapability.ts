import type { BuddyComposerResource } from '@buddy-shared/conversation/composerResource'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'

import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import { resolveModelConfigurationIssue } from '@/modules/models'

export type ChatComposerModelInputIssue = 'image_unsupported' | 'reasoning_unsupported' | 'service_tier_unsupported' | null

export function resolveChatComposerModelInputIssue(input: {
  model: LocalRuntimeModelOption | null
  modelSelection?: { reasoning: BuddyThinkingLevel | null, serviceTier: BuddyServiceTier | null } | null
  resourceIds: readonly string[]
  resources: readonly { resource: Pick<BuddyComposerResource, 'kind' | 'resourceId'> }[]
}): ChatComposerModelInputIssue {
  if (!input.model)
    return null
  const configurationIssue = input.modelSelection ? resolveModelConfigurationIssue(input.model, input.modelSelection) : null
  if (configurationIssue)
    return configurationIssue
  const referenced = new Set(input.resourceIds)
  const hasImage = input.resources.some(({ resource }) => (
    referenced.has(resource.resourceId) && resource.kind === 'image'
  ))
  return hasImage && !input.model.capabilities.includes('image')
    ? 'image_unsupported'
    : null
}
