import type { LocalAttachment } from '@buddy-shared/conversation/attachmentApi'
import type { BuddyComposerResource } from '@buddy-shared/conversation/composerResource'

export function resolveBuddyAttachmentPreviewUrl(attachment: LocalAttachment): string | null {
  if (attachment.kind !== 'image')
    return null
  return attachment.previewUrl
    ?? `lexora-attachment://preview/${encodeURIComponent(attachment.attachmentId)}`
}

export function resolveComposerResourcePreviewUrl(resource: BuddyComposerResource): string | null {
  if (resource.state !== 'ready' || resource.kind !== 'image')
    return null
  if ('attachmentId' in resource)
    return resource.previewUrl ?? `lexora-attachment://preview/${encodeURIComponent(resource.attachmentId)}`
  if ('attachmentId' in resource.source)
    return `lexora-attachment://preview/${encodeURIComponent(resource.source.attachmentId)}`
  if ('artifactId' in resource.source)
    return `lexora-artifact://preview/${encodeURIComponent(resource.source.artifactId)}`
  return null
}
