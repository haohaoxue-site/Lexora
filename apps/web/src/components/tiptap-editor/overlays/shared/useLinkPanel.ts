import type { Editor } from '@tiptap/core'
import type { ComputedRef, ShallowRef } from 'vue'
import { computed, shallowRef } from 'vue'
import { getCurrentBlock } from '../../commands/currentBlock'

type EditorResolver = () => Editor | null | undefined

export type LinkPanelMode = 'selection' | 'empty-block'

interface EditorSelectionRange {
  /** 选区起点 */
  from: number
  /** 选区终点 */
  to: number
}

interface UseLinkPanelOptions {
  onClosed?: () => void
}

export interface LinkPanelController {
  isOpen: ShallowRef<boolean>
  mode: ShallowRef<LinkPanelMode>
  canRemove: ShallowRef<boolean>
  linkText: ShallowRef<string>
  linkUrl: ShallowRef<string>
  isConfirmDisabled: ComputedRef<boolean>
  openSelection: () => void
  openEmptyBlock: () => void
  toggle: () => void
  dismiss: () => void
  cancel: () => void
  apply: () => void
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
  const linkUrl = shallowRef('https://')
  const selectionRange = shallowRef<EditorSelectionRange | null>(null)
  const emptyBlockRange = shallowRef<EditorSelectionRange | null>(null)
  const isConfirmDisabled = computed(() => {
    const href = linkUrl.value.trim()

    if (mode.value === 'selection') {
      return href.length === 0
    }

    return href.length === 0 || linkText.value.trim().length === 0
  })

  function getEditorInstance() {
    return getEditor()
  }

  function rememberSelection(editor: Editor) {
    const { from, to } = editor.state.selection
    selectionRange.value = { from, to }
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
    isOpen.value = false
    canRemove.value = false
    selectionRange.value = null
    emptyBlockRange.value = null
    linkText.value = ''
    linkUrl.value = 'https://'

    if (notifyClosed) {
      options.onClosed?.()
    }
  }

  function openSelection() {
    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    const href = editor.getAttributes('link').href

    mode.value = 'selection'
    linkUrl.value = typeof href === 'string' && href ? href : 'https://'
    canRemove.value = editor.isActive('link') || Boolean(href)
    rememberSelection(editor)
    isOpen.value = true
  }

  function openEmptyBlock() {
    const editor = getEditorInstance()

    if (!editor) {
      return
    }

    mode.value = 'empty-block'
    linkText.value = ''
    linkUrl.value = 'https://'
    canRemove.value = false
    rememberSelection(editor)
    rememberEmptyBlockRange(editor)
    isOpen.value = true
  }

  function cancel() {
    const editor = getEditorInstance()

    if (editor && mode.value === 'selection') {
      getLinkChain(editor).run()
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
      const href = linkUrl.value.trim()
      const chain = getLinkChain(editor)

      if (href) {
        chain.setLink({ href }).run()
      }
      else {
        chain.unsetLink().run()
      }

      finalizeClose()
      return
    }

    insertEmptyBlockLink(
      editor,
      emptyBlockRange.value,
      linkText.value.trim(),
      linkUrl.value.trim(),
    )
    finalizeClose()
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

  return {
    isOpen,
    mode,
    canRemove,
    linkText,
    linkUrl,
    isConfirmDisabled,
    openSelection,
    openEmptyBlock,
    toggle,
    dismiss,
    cancel,
    apply,
    remove,
    updateLinkText,
    updateLinkUrl,
  }
}

function insertEmptyBlockLink(
  editor: Editor,
  blockRange: EditorSelectionRange | null,
  text: string,
  href: string,
) {
  if (!blockRange) {
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
