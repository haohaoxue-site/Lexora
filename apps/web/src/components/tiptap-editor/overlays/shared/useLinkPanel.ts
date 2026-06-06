import type { Editor } from '@tiptap/core'
import type { ComputedRef, ShallowRef } from 'vue'
import { getMarkRange, posToDOMRect } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { computed, shallowRef } from 'vue'
import { getCurrentBlock } from '../../commands/currentBlock'
import {
  clearLinkPanelSelectionHighlight,
  setLinkPanelSelectionHighlight,
} from '../../extensions/LinkPanelSelectionHighlight'
import { normalizeLinkHref, preserveExistingLinkHref } from './linkHref'

type EditorResolver = () => Editor | null | undefined

export type LinkPanelMode = 'selection' | 'empty-block' | 'existing-link'

export interface LinkPanelOpenSelectionOptions {
  focusInput?: boolean
  selectLinkedText?: boolean
}

interface EditorSelectionRange {
  /** 选区起点 */
  from: number
  /** 选区终点 */
  to: number
}

interface LinkPanelReferenceRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
  x: number
  y: number
  toJSON: () => Omit<LinkPanelReferenceRect, 'toJSON'>
}

type LinkPanelReferenceRectData = Omit<LinkPanelReferenceRect, 'toJSON'>

interface LinkPanelReferenceElement {
  getBoundingClientRect: () => LinkPanelReferenceRect
  getClientRects: () => LinkPanelReferenceRect[]
}

interface LinkPanelReferenceAnchor {
  range: EditorSelectionRange
  rect: LinkPanelReferenceRect
  startRect: LinkPanelReferenceRect | null
}

interface UseLinkPanelOptions {
  onClosed?: () => void
  onOpened?: () => void
}

export interface LinkPanelController {
  isOpen: ShallowRef<boolean>
  mode: ShallowRef<LinkPanelMode>
  canRemove: ShallowRef<boolean>
  linkText: ShallowRef<string>
  linkUrl: ShallowRef<string>
  shouldFocusInputOnOpen: ShallowRef<boolean>
  isConfirmDisabled: ComputedRef<boolean>
  getReferencedVirtualElement: () => LinkPanelReferenceElement | null
  openSelection: (options?: LinkPanelOpenSelectionOptions) => void
  openEmptyBlock: () => void
  toggle: () => void
  dismiss: () => void
  cancel: () => void
  apply: () => void
  highlightLinkedText: () => void
  remove: () => void
  updateLinkText: (value: string) => void
  updateLinkUrl: (value: string) => void
}

export function useLinkPanel(
  getEditor: EditorResolver,
  options: UseLinkPanelOptions = {},
): LinkPanelController {
  const isOpen = shallowRef(false)
  const mode = shallowRef<LinkPanelMode>('selection')
  const canRemove = shallowRef(false)
  const linkText = shallowRef('')
  const linkUrl = shallowRef('')
  const shouldFocusInputOnOpen = shallowRef(true)
  const initialLinkText = shallowRef('')
  const initialLinkUrl = shallowRef('')
  const selectionRange = shallowRef<EditorSelectionRange | null>(null)
  const emptyBlockRange = shallowRef<EditorSelectionRange | null>(null)
  const referenceAnchor = shallowRef<LinkPanelReferenceAnchor | null>(null)
  const normalizedLinkUrl = computed(() => normalizeLinkHref(linkUrl.value))
  const linkHrefForCommit = computed(() => {
    if (mode.value !== 'existing-link') {
      return normalizedLinkUrl.value
    }

    return resolveExistingLinkHrefForCommit(
      linkUrl.value,
      initialLinkUrl.value,
      normalizedLinkUrl.value,
    )
  })
  const isConfirmDisabled = computed(() => {
    if (mode.value === 'selection') {
      return !normalizedLinkUrl.value
    }

    return !linkHrefForCommit.value || linkText.value.trim().length === 0
  })

  function getEditorInstance() {
    return getEditor()
  }

  function rememberSelection(editor: Editor, range?: EditorSelectionRange | null) {
    const { from, to } = editor.state.selection
    selectionRange.value = range ?? { from, to }
  }

  function rememberEmptyBlockRange(editor: Editor) {
    const currentBlock = getCurrentBlock(editor.state.selection)

    emptyBlockRange.value = currentBlock
      ? {
          from: currentBlock.from,
          to: currentBlock.to,
        }
      : null
  }

  function getLinkChain(editor: Editor) {
    const chain = editor.chain().focus()

    if (selectionRange.value) {
      chain.setTextSelection(selectionRange.value)
    }

    return chain.extendMarkRange('link')
  }

  function finalizeClose(notifyClosed = true) {
    const editor = getEditorInstance()

    if (editor) {
      clearLinkPanelSelectionHighlight(editor)
    }

    isOpen.value = false
    canRemove.value = false
    selectionRange.value = null
    emptyBlockRange.value = null
    referenceAnchor.value = null
    linkText.value = ''
    linkUrl.value = ''
    shouldFocusInputOnOpen.value = true
    initialLinkText.value = ''
    initialLinkUrl.value = ''

    if (notifyClosed) {
      options.onClosed?.()
    }
  }

  function openSelection(openOptions: LinkPanelOpenSelectionOptions = {}) {
    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    const href = editor.getAttributes('link').href
    const isExistingLink = editor.isActive('link') || Boolean(href)
    const shouldSelectLinkedText = openOptions.selectLinkedText ?? true
    const linkRange = isExistingLink ? getCurrentLinkRange(editor) : null
    const selectionRangeTarget = linkRange ?? editor.state.selection
    const nextSelectionRange = {
      from: selectionRangeTarget.from,
      to: selectionRangeTarget.to,
    }

    mode.value = isExistingLink ? 'existing-link' : 'selection'
    linkText.value = isExistingLink
      ? editor.state.doc.textBetween(nextSelectionRange.from, nextSelectionRange.to, '\n')
      : ''
    linkUrl.value = typeof href === 'string' && href ? href : ''
    shouldFocusInputOnOpen.value = openOptions.focusInput ?? true
    initialLinkText.value = linkText.value
    initialLinkUrl.value = linkUrl.value
    canRemove.value = isExistingLink
    rememberSelection(editor, linkRange)
    referenceAnchor.value = getReferenceAnchor(editor, nextSelectionRange)

    if (mode.value === 'selection' || (mode.value === 'existing-link' && shouldSelectLinkedText)) {
      setLinkPanelSelectionHighlight(editor, nextSelectionRange)
    }
    else {
      clearLinkPanelSelectionHighlight(editor)
    }

    if (mode.value === 'existing-link' && shouldSelectLinkedText) {
      selectEditorRange(editor, nextSelectionRange)
    }

    isOpen.value = true
    options.onOpened?.()
  }

  function openEmptyBlock() {
    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    mode.value = 'empty-block'
    linkText.value = ''
    linkUrl.value = ''
    shouldFocusInputOnOpen.value = true
    initialLinkText.value = ''
    initialLinkUrl.value = ''
    canRemove.value = false
    referenceAnchor.value = null
    clearLinkPanelSelectionHighlight(editor)
    rememberSelection(editor)
    rememberEmptyBlockRange(editor)
    isOpen.value = true
    options.onOpened?.()
  }

  function cancel() {
    const editor = getEditorInstance()

    if (editor && mode.value === 'selection') {
      getLinkChain(editor).run()
    }

    if (editor && mode.value === 'existing-link') {
      commitExistingLinkDraft(editor)
    }

    finalizeClose()
  }

  function toggle() {
    if (isOpen.value) {
      cancel()
      return
    }

    openSelection()
  }

  function dismiss() {
    const editor = getEditorInstance()

    if (editor && mode.value === 'existing-link') {
      commitExistingLinkDraft(editor)
    }

    finalizeClose(false)
  }

  function apply() {
    if (isConfirmDisabled.value) {
      return
    }

    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    if (mode.value === 'selection') {
      const href = normalizedLinkUrl.value

      if (!href) {
        return
      }

      const chain = getLinkChain(editor)
      const didApply = chain.setLink({ href }).run()
      const collapsePosition = didApply ? editor.state.selection.to : null

      finalizeClose()

      if (collapsePosition !== null) {
        exitLinkMarkAtPosition(editor, collapsePosition)
      }

      return
    }

    if (mode.value === 'existing-link') {
      commitExistingLinkDraft(editor)
      finalizeClose()

      return
    }

    const didInsert = insertEmptyBlockLink(
      editor,
      emptyBlockRange.value,
      linkText.value.trim(),
      normalizedLinkUrl.value,
    )
    finalizeClose()

    if (didInsert) {
      exitLinkMarkAtPosition(editor, editor.state.selection.from)
    }
  }

  function remove() {
    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    getLinkChain(editor).unsetLink().run()
    finalizeClose()
  }

  function updateLinkText(value: string) {
    linkText.value = value
  }

  function updateLinkUrl(value: string) {
    linkUrl.value = value
  }

  function highlightLinkedText() {
    const editor = getEditorInstance()

    if (!editor || mode.value !== 'existing-link' || !selectionRange.value) {
      return
    }

    setLinkPanelSelectionHighlight(editor, selectionRange.value)
  }

  function getReferencedVirtualElement(): LinkPanelReferenceElement | null {
    const editor = getEditorInstance()
    const anchor = referenceAnchor.value

    if (!isOpen.value || !editor || !anchor) {
      return null
    }

    return {
      getBoundingClientRect: () => getCurrentReferenceRect(editor, anchor),
      getClientRects: () => [getCurrentReferenceRect(editor, anchor)],
    }
  }

  function commitExistingLinkDraft(editor: Editor) {
    if (mode.value !== 'existing-link' || isConfirmDisabled.value) {
      return false
    }

    const href = linkHrefForCommit.value
    const text = linkText.value.trim()

    if (!hasExistingLinkDraftChanged(text, href, initialLinkText.value, initialLinkUrl.value)) {
      return false
    }

    const nextRange = updateExistingLink(
      editor,
      selectionRange.value,
      text,
      href,
    )

    if (!nextRange) {
      return false
    }

    selectionRange.value = nextRange
    setLinkPanelSelectionHighlight(editor, nextRange)

    return true
  }

  return {
    isOpen,
    mode,
    canRemove,
    linkText,
    linkUrl,
    shouldFocusInputOnOpen,
    isConfirmDisabled,
    getReferencedVirtualElement,
    openSelection,
    openEmptyBlock,
    toggle,
    dismiss,
    cancel,
    apply,
    highlightLinkedText,
    remove,
    updateLinkText,
    updateLinkUrl,
  }
}

function getCurrentLinkRange(editor: Editor): EditorSelectionRange | null {
  const linkType = editor.schema.marks.link

  if (!linkType) {
    return null
  }

  const range = getMarkRange(editor.state.selection.$from, linkType)

  return range
    ? {
        from: range.from,
        to: range.to,
      }
    : null
}

function selectEditorRange(editor: Editor, range: EditorSelectionRange) {
  const view = editor.view

  if (editor.isDestroyed || !view || range.to <= range.from || range.to > editor.state.doc.content.size) {
    return
  }

  view.dispatch(editor.state.tr
    .setSelection(TextSelection.create(editor.state.doc, range.from, range.to))
    .setMeta('addToHistory', false))
}

function getReferenceAnchor(editor: Editor, range: EditorSelectionRange): LinkPanelReferenceAnchor | null {
  const rect = getReferenceRect(editor, range)

  if (!rect) {
    return null
  }

  return {
    range,
    rect,
    startRect: getPositionReferenceRect(editor, range.from),
  }
}

function getReferenceRect(editor: Editor, range: EditorSelectionRange): LinkPanelReferenceRect | null {
  const view = editor.view

  if (!view || typeof view.coordsAtPos !== 'function' || range.to < range.from) {
    return null
  }

  try {
    return createReferenceRectSnapshot(posToDOMRect(view, range.from, range.to))
  }
  catch {
    return null
  }
}

function getPositionReferenceRect(editor: Editor, position: number): LinkPanelReferenceRect | null {
  const view = editor.view

  if (!view || typeof view.coordsAtPos !== 'function' || position > editor.state.doc.content.size) {
    return null
  }

  try {
    const rect = view.coordsAtPos(position)
    return createReferenceRectSnapshot({
      bottom: rect.bottom,
      height: rect.bottom - rect.top,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.right - rect.left,
      x: rect.left,
      y: rect.top,
    })
  }
  catch {
    return null
  }
}

function getCurrentReferenceRect(editor: Editor, anchor: LinkPanelReferenceAnchor): LinkPanelReferenceRect {
  const currentStartRect = anchor.startRect
    ? getPositionReferenceRect(editor, anchor.range.from)
    : null

  if (!currentStartRect || !anchor.startRect) {
    return anchor.rect
  }

  return shiftReferenceRect(anchor.rect, {
    left: currentStartRect.left - anchor.startRect.left,
    top: currentStartRect.top - anchor.startRect.top,
  })
}

function createReferenceRectSnapshot(rect: LinkPanelReferenceRectData): LinkPanelReferenceRect {
  const data = {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  }

  return {
    ...data,
    toJSON: () => data,
  }
}

function shiftReferenceRect(rect: LinkPanelReferenceRect, delta: { left: number, top: number }): LinkPanelReferenceRect {
  return createReferenceRectSnapshot({
    bottom: rect.bottom + delta.top,
    height: rect.height,
    left: rect.left + delta.left,
    right: rect.right + delta.left,
    top: rect.top + delta.top,
    width: rect.width,
    x: rect.x + delta.left,
    y: rect.y + delta.top,
  })
}

function updateExistingLink(
  editor: Editor,
  range: EditorSelectionRange | null,
  text: string,
  href: string | null,
): EditorSelectionRange | null {
  if (!range || !href) {
    return null
  }

  const didApply = editor.chain().focus().insertContentAt(
    range,
    {
      type: 'text',
      text,
      marks: [
        {
          type: 'link',
          attrs: {
            href,
          },
        },
      ],
    },
  ).setTextSelection(range.from + text.length).unsetMark('link').run()

  return didApply
    ? {
        from: range.from,
        to: range.from + text.length,
      }
    : null
}

function insertEmptyBlockLink(
  editor: Editor,
  blockRange: EditorSelectionRange | null,
  text: string,
  href: string | null,
) {
  if (!blockRange || !href) {
    return false
  }

  return editor.chain().focus().insertContentAt(
    {
      from: blockRange.from,
      to: blockRange.to,
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
          marks: [
            {
              type: 'link',
              attrs: {
                href,
              },
            },
          ],
        },
      ],
    },
  ).run()
}

function exitLinkMarkAtPosition(editor: Editor, position: number) {
  editor.chain().focus().setTextSelection(position).unsetMark('link').run()
}

function resolveExistingLinkHrefForCommit(
  input: string,
  initialHref: string,
  normalizedHref: string | null,
) {
  if (normalizedHref) {
    return normalizedHref
  }

  return input.trim() === initialHref.trim()
    ? preserveExistingLinkHref(initialHref)
    : null
}

function hasExistingLinkDraftChanged(
  text: string,
  href: string | null,
  initialText: string,
  initialHref: string,
) {
  return text !== initialText.trim()
    || href !== preserveExistingLinkHref(initialHref)
}
