import type { Editor } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface LinkPanelSelectionRange {
  from: number
  to: number
}

type LinkPanelSelectionMeta
  = | {
    range: LinkPanelSelectionRange
    type: 'set'
  }
  | {
    type: 'clear'
  }

const LINK_PANEL_SELECTION_CLASS = 'tiptap-link-panel-selection'
const linkPanelSelectionHighlightPluginKey = new PluginKey<LinkPanelSelectionRange | null>('linkPanelSelectionHighlight')

export const LinkPanelSelectionHighlight = Extension.create({
  name: 'linkPanelSelectionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<LinkPanelSelectionRange | null>({
        key: linkPanelSelectionHighlightPluginKey,
        state: {
          init: () => null,
          apply(transaction, value) {
            const meta = transaction.getMeta(linkPanelSelectionHighlightPluginKey) as LinkPanelSelectionMeta | undefined

            if (meta?.type === 'clear') {
              return null
            }

            if (meta?.type === 'set') {
              return normalizeRange(meta.range)
            }

            if (!value || !transaction.docChanged) {
              return value
            }

            return normalizeRange({
              from: transaction.mapping.map(value.from, -1),
              to: transaction.mapping.map(value.to, 1),
            })
          },
        },
        props: {
          decorations(state) {
            const range = linkPanelSelectionHighlightPluginKey.getState(state)

            if (!range) {
              return null
            }

            const documentSize = state.doc.content.size
            const from = clampPosition(range.from, documentSize)
            const to = clampPosition(range.to, documentSize)

            if (to <= from) {
              return null
            }

            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, {
                class: LINK_PANEL_SELECTION_CLASS,
              }),
            ])
          },
        },
      }),
    ]
  },
})

export function setLinkPanelSelectionHighlight(editor: Editor, range: LinkPanelSelectionRange) {
  if (!canDispatchEditorTransaction(editor)) {
    return
  }

  if (range.to <= range.from) {
    clearLinkPanelSelectionHighlight(editor)
    return
  }

  editor.view.dispatch(editor.state.tr
    .setMeta(linkPanelSelectionHighlightPluginKey, {
      range,
      type: 'set',
    } satisfies LinkPanelSelectionMeta)
    .setMeta('addToHistory', false))
}

export function clearLinkPanelSelectionHighlight(editor: Editor) {
  if (!canDispatchEditorTransaction(editor)) {
    return
  }

  editor.view.dispatch(editor.state.tr
    .setMeta(linkPanelSelectionHighlightPluginKey, {
      type: 'clear',
    } satisfies LinkPanelSelectionMeta)
    .setMeta('addToHistory', false))
}

function canDispatchEditorTransaction(editor: Editor): boolean {
  return !editor.isDestroyed
    && typeof editor.view?.dispatch === 'function'
    && typeof editor.state?.tr?.setMeta === 'function'
}

function normalizeRange(range: LinkPanelSelectionRange): LinkPanelSelectionRange | null {
  return range.to > range.from
    ? range
    : null
}

function clampPosition(position: number, documentSize: number) {
  return Math.max(0, Math.min(position, documentSize))
}
