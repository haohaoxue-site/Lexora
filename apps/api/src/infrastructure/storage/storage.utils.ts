import type { StorageContentDisposition } from './storage.interface'

const STORAGE_CONTENT_DISPOSITION_DEFAULT_FILE_NAME = {
  inline: 'file',
  attachment: 'attachment',
} as const

export function buildStorageContentDisposition(input: StorageContentDisposition): string {
  const normalizedFileName = input.fileName?.trim() || input.fallbackFileName?.trim() || STORAGE_CONTENT_DISPOSITION_DEFAULT_FILE_NAME[input.type]
  return `${input.type}; filename="${normalizedFileName.replace(/"/g, '')}"`
}
