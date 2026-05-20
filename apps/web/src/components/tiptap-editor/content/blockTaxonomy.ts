export const TIPTAP_NESTED_PARAGRAPH_PARENT_NODE_NAMES = [
  'blockquote',
  'listItem',
  'taskItem',
  'tableCell',
  'tableHeader',
] as const

export const TIPTAP_STRUCTURAL_BACKSPACE_BOUNDARY_NODE_NAMES = [
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'blockMath',
  'table',
] as const

export const TIPTAP_SPLIT_MERGE_EXCLUDED_ANCESTOR_NODE_NAMES = [
  ...TIPTAP_STRUCTURAL_BACKSPACE_BOUNDARY_NODE_NAMES,
  'listItem',
  'taskItem',
  'tableRow',
  'tableCell',
  'tableHeader',
] as const
