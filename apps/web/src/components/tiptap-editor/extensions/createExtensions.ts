import type { Editor, Extensions } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type {
  TiptapEditorUploadedFile,
  TiptapEditorUploadedImage,
} from '../content/typing'
import type { TiptapEditorCollaborationBinding } from '../core/typing'
import { isNodeEmpty } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { TextStyle } from '@tiptap/extension-text-style'
import { PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { EditorAiPreview } from '../ai/EditorAiPreview'
import {
  createTiptapCollaborationCursorUser,
  renderTiptapCollaborationCursor,
  renderTiptapCollaborationSelection,
} from '../collaboration/cursor'
import { BlockCommands } from '../extensions/BlockCommands'
import { BlockId } from '../extensions/BlockId'
import { DocumentFile } from '../extensions/DocumentFile'
import { DocumentImage } from '../extensions/DocumentImage'
import { PastePipeline } from '../extensions/PastePipeline'
import { TextAlign } from '../extensions/TextAlign'
import { TextColorClass } from '../extensions/TextColorClass'

const BODY_PLACEHOLDER = '输入 / 唤起命令，或者直接开始写作。'
const BODY_EMPTY_LINE_PLACEHOLDER = '按 space（空格）以启用 AI，或按“/”启用命令'
const TITLE_PLACEHOLDER = '输入文档标题'

export function createBodyExtensions(options: {
  uploadImage?: (file: File) => Promise<TiptapEditorUploadedImage>
  uploadFile?: (file: File) => Promise<TiptapEditorUploadedFile>
  collaboration?: TiptapEditorCollaborationBinding | null
} = {}): Extensions {
  return [
    BlockId,
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5],
      },
      link: {
        openOnClick: false,
      },
      undoRedo: options.collaboration ? false : undefined,
    }),
    ...createCollaborationExtensions(options.collaboration),
    Placeholder.configure({
      placeholder: ({ editor, node }) => resolveBodyPlaceholder(editor, node),
    }),
    TextStyle,
    TextColorClass,
    TextAlign,
    EditorAiPreview,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    DocumentImage.configure({
      inline: false,
    }),
    DocumentFile,
    BlockCommands,
    PastePipeline.configure({
      uploadImage: options.uploadImage,
      uploadFile: options.uploadFile,
    }),
  ]
}

function resolveBodyPlaceholder(editor: Editor, node: ProseMirrorNode) {
  if (node.type.name === 'heading') {
    return resolveHeadingPlaceholder(node.attrs?.level)
  }

  if (node.type.name !== 'paragraph') {
    return ''
  }

  if (isOnlyEmptyParagraphDocument(editor)) {
    return BODY_PLACEHOLDER
  }

  return BODY_EMPTY_LINE_PLACEHOLDER
}

function resolveHeadingPlaceholder(level: unknown) {
  if (typeof level === 'number' && Number.isInteger(level) && level > 0) {
    return `标题${level}`
  }

  return '标题'
}

function isOnlyEmptyParagraphDocument(editor: Editor) {
  const firstChild = editor.state.doc.firstChild

  return editor.state.doc.childCount === 1
    && firstChild?.type.name === 'paragraph'
    && isNodeEmpty(firstChild)
}

export function createTitleExtensions(options: {
  collaboration?: TiptapEditorCollaborationBinding | null
} = {}): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      strike: false,
      undoRedo: options.collaboration ? false : undefined,
    }),
    ...createCollaborationExtensions(options.collaboration),
    Placeholder.configure({
      placeholder: TITLE_PLACEHOLDER,
    }),
  ]
}

function createCollaborationExtensions(
  collaboration: TiptapEditorCollaborationBinding | null | undefined,
): Extensions {
  if (!collaboration) {
    return []
  }

  const extensions: Extensions = [
    Collaboration.configure({
      document: collaboration.document,
      field: collaboration.field,
      provider: collaboration.provider ?? null,
      yUndoOptions: {
        trackedOrigins: [PluginKey],
      },
    }),
  ]

  if (collaboration.provider && collaboration.awarenessState) {
    extensions.push(CollaborationCursor.configure({
      provider: collaboration.provider,
      user: createTiptapCollaborationCursorUser(collaboration.awarenessState),
      render: renderTiptapCollaborationCursor,
      selectionRender: renderTiptapCollaborationSelection,
    }))
  }

  return extensions
}
