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
