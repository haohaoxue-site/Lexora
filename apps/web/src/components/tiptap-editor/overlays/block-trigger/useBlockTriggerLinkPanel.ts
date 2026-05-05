import type { Editor } from '@tiptap/core'
import type { BlockTriggerOverlayController } from './useBlockTriggerOverlay'
import { useLinkPanel } from '../shared/useLinkPanel'
import { useLinkPanelMountGuard } from '../shared/useLinkPanelMountGuard'

export function useBlockTriggerLinkPanel(
  editor: Editor,
  overlay: BlockTriggerOverlayController,
) {
  const linkPanel = useLinkPanel(() => editor, {
    onClosed: overlay.closeMenu,
  })

  useLinkPanelMountGuard(linkPanel, overlay.shouldKeepLinkPanelMounted)

  return {
    linkPanel,
    openEmptyBlockLinkPanel,
  }

  function openEmptyBlockLinkPanel() {
    if (!overlay.openPanel('link')) {
      return false
    }

    linkPanel.openEmptyBlock()
    return true
  }
}
