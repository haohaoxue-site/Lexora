import type { Editor } from '@tiptap/core'
import type { ComputedRef } from 'vue'
import type { LinkPanelController } from '../shared/useLinkPanel'
import { computed } from 'vue'
import { isImageSelection } from '../../commands/editorActions'
import { useEditorSnapshot } from '../shared/useEditorSnapshot'
import { useLinkPanel } from '../shared/useLinkPanel'
import { useLinkPanelMountGuard } from '../shared/useLinkPanelMountGuard'

/** 选择工具栏浮层显示上下文。 */
export interface BubbleToolbarShouldShowContext {
  /** 编辑器实例 */
  editor: Editor
  /** 选区起点 */
  from: number
  /** 选区终点 */
  to: number
}

/** 选择工具栏浮层控制器。 */
export interface BubbleToolbarOverlayController {
  /** 链接面板控制器 */
  linkPanel: LinkPanelController
  /** 是否展示工具栏 */
  shouldShowToolbar: (context: BubbleToolbarShouldShowContext) => boolean
  /** 是否展示链接面板 */
  shouldShowLinkPanel: (context: BubbleToolbarShouldShowContext) => boolean
  /** 是否保持链接面板挂载 */
  shouldKeepLinkPanelMounted: ComputedRef<boolean>
}

export function useBubbleToolbarOverlay(editor: Editor): BubbleToolbarOverlayController {
  const editorSnapshot = useEditorSnapshot(editor, {
    ignoreCollaborationOrigin: true,
  })
  const linkPanel = useLinkPanel(() => editor)
  const shouldKeepLinkPanelMounted = computed(() => {
    void editorSnapshot.value

    const { from, to } = editor.state.selection
    return (from !== to || editor.isActive('link')) && !isImageSelection(editor)
  })

  useLinkPanelMountGuard(linkPanel, shouldKeepLinkPanelMounted)

  return {
    linkPanel,
    shouldShowToolbar,
    shouldShowLinkPanel,
    shouldKeepLinkPanelMounted,
  }

  function shouldShowToolbar({ from, to }: BubbleToolbarShouldShowContext): boolean {
    return isImageSelection(editor) || editor.isActive('link') || from !== to
  }

  function shouldShowLinkPanel({ from, to }: BubbleToolbarShouldShowContext): boolean {
    return Boolean(linkPanel.isOpen.value && !isImageSelection(editor) && (from !== to || editor.isActive('link')))
  }
}
