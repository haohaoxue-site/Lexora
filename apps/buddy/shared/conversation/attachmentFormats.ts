export const BUDDY_MEDIA_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'video/mp4', 'video/webm'] as const
export const BUDDY_DOCUMENT_MIME_TYPES = ['application/pdf', ...BUDDY_MEDIA_MIME_TYPES] as const
export type BuddyDocumentMimeType = typeof BUDDY_DOCUMENT_MIME_TYPES[number]
export const BUDDY_MEDIA_FILE_BYTES_LIMIT = 10 * 1024 * 1024

export const BUDDY_MEDIA_EXTENSIONS = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
} as const

export function isDocumentMimeType(value: unknown): value is BuddyDocumentMimeType {
  return typeof value === 'string' && (BUDDY_DOCUMENT_MIME_TYPES as readonly string[]).includes(value)
}
