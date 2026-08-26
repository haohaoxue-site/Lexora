import { z } from 'zod'

export const BUDDY_ATTACHMENT_COUNT_LIMIT = 16
export const BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT = 32 * 1024 * 1024

export const BUDDY_IMAGE_ATTACHMENT_EXTENSIONS = [
  'gif',
  'jpeg',
  'jpg',
  'png',
  'webp',
] as const

export const BUDDY_TEXT_ATTACHMENT_EXTENSIONS = [
  'csv',
  'json',
  'md',
  'toml',
  'tsv',
  'txt',
  'xml',
  'yaml',
  'yml',
] as const

export const BUDDY_ATTACHMENT_DIALOG_EXTENSIONS = [
  ...BUDDY_IMAGE_ATTACHMENT_EXTENSIONS,
  ...BUDDY_TEXT_ATTACHMENT_EXTENSIONS,
]

const buddyAttachmentUploadSchema = z.object({
  bytes: z.instanceof(Uint8Array).refine(
    value => value.byteLength <= BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
  ),
  mimeType: z.string().trim().max(255),
  name: z.string().trim().min(1).max(255),
}).strict()

export const buddyAttachmentImportRequestSchema = z.object({
  files: z.array(buddyAttachmentUploadSchema).min(1).max(BUDDY_ATTACHMENT_COUNT_LIMIT),
}).strict().refine(
  input => input.files.reduce((total, file) => total + file.bytes.byteLength, 0)
    <= BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
)

export type BuddyAttachmentImportRequest = z.infer<typeof buddyAttachmentImportRequestSchema>
export type BuddyAttachmentUpload = z.infer<typeof buddyAttachmentUploadSchema>
