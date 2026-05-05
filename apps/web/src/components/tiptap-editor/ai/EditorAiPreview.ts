import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorAiPreviewAnchor, EditorAiPreviewStatus } from './typing'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { splitPlainTextParagraphLines } from '../content/pasteContent'
import {
  EDITOR_AI_PREVIEW_ANCHOR_BLOCK_CLASS,
  EDITOR_AI_PREVIEW_CLASS,
  EDITOR_AI_PREVIEW_DECORATION_KEY_PREFIX,
  EDITOR_AI_PREVIEW_EMPTY_TEXT_BY_STATUS,
  EDITOR_AI_PREVIEW_PLUGIN_KEY_NAME,
  EDITOR_AI_PREVIEW_SELECTION_CLASS,
} from './contracts'

interface EditorAiPreviewPluginState {
  anchor: EditorAiPreviewAnchor
  text: string
  status: EditorAiPreviewStatus
}

type EditorAiPreviewMeta
  = | {
    type: 'set'
    preview: EditorAiPreviewPluginState
  }
  | {
    type: 'clear'
  }

const editorAiPreviewPluginKey = new PluginKey<EditorAiPreviewPluginState | null>(EDITOR_AI_PREVIEW_PLUGIN_KEY_NAME)

export const EditorAiPreview = Extension.create({
  name: 'editorAiPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<EditorAiPreviewPluginState | null>({
        key: editorAiPreviewPluginKey,
        state: {
          init: () => null,
          apply(transaction, value) {
            const meta = transaction.getMeta(editorAiPreviewPluginKey) as EditorAiPreviewMeta | undefined

            if (meta?.type === 'clear') {
              return null
            }

            if (meta?.type === 'set') {
              return meta.preview
            }

            if (transaction.docChanged) {
              return null
            }

            return value
          },
        },
        props: {
          decorations(state) {
            const preview = editorAiPreviewPluginKey.getState(state)

            if (!preview) {
              return null
            }

            return DecorationSet.create(state.doc, createEditorAiPreviewDecorations(preview, state.doc))
          },
        },
      }),
    ]
  },
})

export function setEditorAiPreview(editor: Editor, preview: EditorAiPreviewPluginState): void {
  if (!canDispatchEditorTransaction(editor)) {
    return
  }

  editor.view.dispatch(editor.state.tr.setMeta(editorAiPreviewPluginKey, {
    type: 'set',
    preview,
  } satisfies EditorAiPreviewMeta))
}

export function clearEditorAiPreview(editor: Editor): void {
  if (!canDispatchEditorTransaction(editor)) {
    return
  }

  editor.view.dispatch(editor.state.tr.setMeta(editorAiPreviewPluginKey, {
    type: 'clear',
  } satisfies EditorAiPreviewMeta))
}

function canDispatchEditorTransaction(editor: Editor): boolean {
  return !editor.isDestroyed && Boolean(editor.view) && Boolean(editor.state)
}

function createEditorAiPreviewDecorations(
  preview: EditorAiPreviewPluginState,
  doc: ProseMirrorNode,
) {
  const documentSize = doc.content.size
  const displayText = resolveDisplayPreviewText(preview)
  const isBlockPreview = shouldRenderBlockPreview(preview.anchor, displayText)
  const widget = Decoration.widget(
    resolveWidgetPosition(preview.anchor, doc, isBlockPreview),
    () => createEditorAiPreviewElement(preview, displayText, isBlockPreview),
    {
      key: `${EDITOR_AI_PREVIEW_DECORATION_KEY_PREFIX}:${preview.status}:${preview.text}`,
      side: preview.anchor.kind === 'block-insert' ? -1 : 1,
    },
  )

  if (preview.anchor.kind === 'block-insert') {
    const from = clampPosition(preview.anchor.from, documentSize)
    const to = clampPosition(preview.anchor.to, documentSize)

    if (to <= from) {
      return [widget]
    }

    return [
      Decoration.node(from, to, {
        class: EDITOR_AI_PREVIEW_ANCHOR_BLOCK_CLASS,
      }),
      widget,
    ]
  }

  if (preview.anchor.kind !== 'text-selection') {
    return [widget]
  }

  const from = clampPosition(preview.anchor.from, documentSize)
  const to = clampPosition(preview.anchor.to, documentSize)

  if (to <= from) {
    return [widget]
  }

  return [
    Decoration.inline(from, to, {
      class: EDITOR_AI_PREVIEW_SELECTION_CLASS,
    }),
    widget,
  ]
}

function createEditorAiPreviewElement(
  preview: EditorAiPreviewPluginState,
  displayText: string,
  isBlockPreview: boolean,
) {
  if (isBlockPreview) {
    return createEditorAiPreviewBlockElement(preview, displayText)
  }

  const element = document.createElement('span')
  element.className = `${EDITOR_AI_PREVIEW_CLASS} ${EDITOR_AI_PREVIEW_CLASS}--inline is-${preview.status}`
  element.contentEditable = 'false'
  element.textContent = displayText
  return element
}

function createEditorAiPreviewBlockElement(preview: EditorAiPreviewPluginState, displayText: string) {
  const element = document.createElement('div')
  element.className = `${EDITOR_AI_PREVIEW_CLASS} ${EDITOR_AI_PREVIEW_CLASS}--block is-${preview.status}`
  element.contentEditable = 'false'

  for (const line of splitPlainTextParagraphLines(displayText)) {
    const paragraph = document.createElement('p')
    paragraph.className = `${EDITOR_AI_PREVIEW_CLASS}__paragraph`

    if (line) {
      const text = document.createElement('span')
      text.className = `${EDITOR_AI_PREVIEW_CLASS}__text`
      text.textContent = line
      paragraph.append(text)
    }
    else {
      paragraph.append(document.createElement('br'))
    }

    element.append(paragraph)
  }

  return element
}

function resolveWidgetPosition(
  anchor: EditorAiPreviewAnchor,
  doc: ProseMirrorNode,
  isBlockPreview: boolean,
) {
  const documentSize = doc.content.size

  if (anchor.kind === 'block-insert') {
    return clampPosition(anchor.from, documentSize)
  }

  if (isBlockPreview) {
    return resolveTextSelectionBlockWidgetPosition(anchor, doc)
  }

  return clampPosition(anchor.to, documentSize)
}

function resolveTextSelectionBlockWidgetPosition(
  anchor: Extract<EditorAiPreviewAnchor, { kind: 'text-selection' }>,
  doc: ProseMirrorNode,
) {
  const documentSize = doc.content.size
  const resolvedPosition = doc.resolve(clampPosition(anchor.to, documentSize))

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    if (resolvedPosition.node(depth).isTextblock) {
      return resolvedPosition.after(depth)
    }
  }

  return clampPosition(anchor.to, documentSize)
}

function shouldRenderBlockPreview(anchor: EditorAiPreviewAnchor, displayText: string) {
  return anchor.kind === 'block-insert'
    || splitPlainTextParagraphLines(displayText).length > 1
}

function resolveDisplayPreviewText(preview: EditorAiPreviewPluginState) {
  return preview.text.trim() || resolveEmptyPreviewText(preview.status)
}

function resolveEmptyPreviewText(status: EditorAiPreviewStatus) {
  return EDITOR_AI_PREVIEW_EMPTY_TEXT_BY_STATUS[status]
}

function clampPosition(position: number, documentSize: number) {
  return Math.max(0, Math.min(position, documentSize))
}
