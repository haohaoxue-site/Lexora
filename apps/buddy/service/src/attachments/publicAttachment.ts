import type { AttachmentRecord } from '../storage/attachmentRepository'

export function toPublicAttachment(record: AttachmentRecord) {
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
  const attachmentsById = new Map(attachments.map(record => [record.id, record]))
  return items.map((item) => {
    if (item.kind && item.kind !== 'message')
      return item
    return {
      ...item,
      attachments: readMessageAttachmentIds(item.content)
        .flatMap(id => attachmentsById.get(id) ?? [])
        .map(toPublicAttachment),
    }
  })
}

function readMessageAttachmentIds(content: unknown): string[] {
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
