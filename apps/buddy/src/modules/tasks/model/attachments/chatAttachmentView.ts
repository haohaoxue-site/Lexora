import type { LocalAttachment } from '@buddy-shared/conversation/attachmentApi'

export function resolveBuddyAttachmentPreviewUrl(attachment: LocalAttachment): string | null {
  if (attachment.kind !== 'image')
    return null
  return attachment.previewUrl
    ?? `lexora-attachment://preview/${encodeURIComponent(attachment.attachmentId)}`
}
