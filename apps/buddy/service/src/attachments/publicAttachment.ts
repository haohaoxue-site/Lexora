import type { LocalAttachment } from '../../../shared/conversation/attachmentApi'
import type { AttachmentRecord } from '../storage/attachmentRepository'
import { readBuddyUserMessageContent } from '../../../shared/conversation/buddyUserContent'

export function toPublicAttachment(record: AttachmentRecord): LocalAttachment {
  return {
    attachmentId: record.id,
    kind: record.mimeType.startsWith('image/')
      ? 'image'
      : isTextMimeType(record.mimeType) ? 'text' : 'binary',
    mimeType: record.mimeType,
    name: record.name,
    previewUrl: null,
    sizeBytes: record.sizeBytes,
  }
}

export function withMessageAttachments<
  Item extends { content?: unknown, kind?: string },
>(items: readonly Item[], attachments: readonly AttachmentRecord[]) {
  const readAttachments = createMessageAttachmentReader(attachments)
  return items.map((item) => {
    if (item.kind && item.kind !== 'message')
      return item
    return {
      ...item,
      attachments: readAttachments(item.content),
    }
  })
}

export function createMessageAttachmentReader(attachments: readonly AttachmentRecord[]) {
  const byId = new Map(attachments.map(record => [record.id, record]))
  return (content: unknown) => readMessageAttachmentIds(content).flatMap((id) => {
    const attachment = byId.get(id)
    return attachment ? [toPublicAttachment(attachment)] : []
  })
}

function readMessageAttachmentIds(content: unknown): string[] {
  const structured = readBuddyUserMessageContent(content)
  if (structured)
    return structured.resourceSnapshots.map(snapshot => snapshot.attachmentId)
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return []
  const attachmentIds = (content as Record<string, unknown>).attachmentIds
  return Array.isArray(attachmentIds)
    ? attachmentIds.filter((id): id is string => typeof id === 'string')
    : []
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || new Set([
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ]).has(mimeType)
}
