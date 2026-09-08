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
  'bash',
  'c',
  'cjs',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'go',
  'graphql',
  'h',
  'hpp',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsonc',
  'jsx',
  'kt',
  'log',
  'md',
  'mjs',
  'py',
  'rs',
  'rst',
  'scss',
  'sh',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'tsv',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
] as const

export const BUDDY_ATTACHMENT_DIALOG_EXTENSIONS = [
  ...BUDDY_IMAGE_ATTACHMENT_EXTENSIONS,
  ...BUDDY_TEXT_ATTACHMENT_EXTENSIONS,
]

export interface BuddyAttachmentUpload {
  bytes: Uint8Array
  mimeType: string
  name: string
}
