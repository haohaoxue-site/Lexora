export const TIPTAP_BODY_BLOCK_ID_PREFIX = 'block_' as const
export const TIPTAP_BODY_BLOCK_ID_ATTRIBUTE = 'id' as const
export const TIPTAP_BODY_BLOCK_ID_NODE_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'file',
] as const
export const TIPTAP_DOCUMENT_FILE_NODE_TYPE = 'document-file' as const
export const TIPTAP_DOCUMENT_FILE_NODE_PART = {
  TITLE: 'title',
  META: 'meta',
} as const
