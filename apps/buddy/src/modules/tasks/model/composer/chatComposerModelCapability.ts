import type { BuddyComposerResource } from '@buddy-shared/conversation/composerResource'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'

import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import { isDocumentMimeType } from '@buddy-shared/conversation/attachmentFormats'
import { resolveModelConfigurationIssue } from '@/modules/models'

export type ChatComposerModelInputIssue = 'image_unsupported' | 'pdf_unsupported' | 'audio_unsupported' | 'video_unsupported' | 'reasoning_unsupported' | 'service_tier_unsupported' | null

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
  const referenced = new Set(input.resourceIds)
  for (const { resource } of input.resources) {
    if (!referenced.has(resource.resourceId))
      continue
    if (resource.kind === 'audio' || resource.kind === 'video' || resource.kind === 'pdf') {
      if (!isDocumentMimeType(resource.mimeType) || !input.model.fileInputMimeTypes.includes(resource.mimeType))
        return `${resource.kind}_unsupported`
    }
  }
  const hasImage = input.resources.some(({ resource }) => (
    referenced.has(resource.resourceId) && resource.kind === 'image'
  ))
  return hasImage && !input.model.capabilities.includes('image')
    ? 'image_unsupported'
    : null
}
