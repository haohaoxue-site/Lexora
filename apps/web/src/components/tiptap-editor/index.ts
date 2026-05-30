import './tiptap.scss'

export {
  createTiptapDocumentCollaborationYdoc,
  hydrateTiptapDocumentCollaborationYdoc,
  projectTiptapDocumentCollaborationYdoc,
  TIPTAP_DOCUMENT_COLLABORATION_FIELD,
} from './collaboration/ydoc'

export type { TiptapDocumentCollaborationContentProjection } from './collaboration/ydoc'
export type { TurnIntoBlockType } from './commands/turnInto'
export type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
  TiptapEditorContent,
  TiptapEditorContentSource,
  TiptapEditorSelectionContextRequest,
} from './core/typing'
export {
  DocumentBodyEditor,
  DocumentContentSurface,
  DocumentTitleEditor,
} from './presets'
export type {
  DocumentContentSurfaceEmits,
  DocumentContentSurfaceProps,
} from './presets/document/typing'
