import type { LocalRuntimeModelOption } from '@buddy-electron/shared/localChatApi'
import type { ComposerResourceView } from './useComposerResources'

export type ChatComposerModelInputIssue = 'image_unsupported' | null

export function resolveChatComposerModelInputIssue(input: {
  model: LocalRuntimeModelOption | null
  resourceIds: readonly string[]
  resources: readonly ComposerResourceView[]
}): ChatComposerModelInputIssue {
  if (!input.model)
    return null
  const referenced = new Set(input.resourceIds)
  const hasImage = input.resources.some(({ resource }) => (
    referenced.has(resource.resourceId) && resource.kind === 'image'
  ))
  return hasImage && !input.model.capabilities.includes('image')
    ? 'image_unsupported'
    : null
}
