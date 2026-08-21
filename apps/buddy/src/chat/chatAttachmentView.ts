import type { LocalAttachment } from '../../electron/shared/localChatApi'

export function resolveBuddyAttachmentPreviewUrl(attachment: LocalAttachment): string | null {
  if (attachment.kind !== 'image')
    return null
  return attachment.previewUrl
    ?? `lexora-attachment://preview/${encodeURIComponent(attachment.attachmentId)}`
}
