import type { Editor } from '@tiptap/core'
import type { TiptapEditorUploadedFile, TiptapEditorUploadedImage } from '../../content/typing'
import type { TiptapEditorCommentRequest } from '../../core/typing'
import { computed, ref } from 'vue'
import { useBlockTriggerActions } from './useBlockTriggerActions'
import { useBlockTriggerDrag } from './useBlockTriggerDrag'
import { useBlockTriggerLinkPanel } from './useBlockTriggerLinkPanel'
import { useBlockTriggerOverlay } from './useBlockTriggerOverlay'
import { useBlockTriggerState } from './useBlockTriggerState'

export function useBlockTriggerMenu(options: {
  editor: Editor
  onRequestComment: (request: TiptapEditorCommentRequest) => void
  uploadImage?: (file: File) => Promise<TiptapEditorUploadedImage>
  uploadFile?: (file: File) => Promise<TiptapEditorUploadedFile>
}) {
  const imageInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const overlay = useBlockTriggerOverlay(options.editor)
  const state = useBlockTriggerState(options.editor)
  const drag = useBlockTriggerDrag({
    editor: options.editor,
    canDrag: computed(() => state.value.canDrag),
    closeMenu: overlay.closeMenu,
  })
  const linkPanelController = useBlockTriggerLinkPanel(options.editor, overlay)
  const actions = useBlockTriggerActions({
    editor: options.editor,
    openPanel: overlay.openPanel,
    openLinkPanel: linkPanelController.openEmptyBlockLinkPanel,
    closeMenu: overlay.closeMenu,
    imageInputRef,
    fileInputRef,
    linkPanel: linkPanelController.linkPanel,
    onRequestComment: options.onRequestComment,
    uploadImage: options.uploadImage,
    uploadFile: options.uploadFile,
  })

  return {
    state,
    visible: overlay.visible,
    activePanel: overlay.activePanel,
    shouldRenderTriggerMenu: overlay.shouldRenderTriggerMenu,
    isTriggerButtonVisible: overlay.isTriggerButtonVisible,
    anchorStyle: overlay.anchorStyle,
    isDragging: drag.isDragging,
    dropIndicatorStyle: drag.dropIndicatorStyle,
    imageInputRef,
    fileInputRef,
    linkPanel: linkPanelController.linkPanel,
    openMenu: overlay.openMenu,
    closeMenu: overlay.closeMenu,
    handleTriggerMouseEnter: overlay.handleTriggerMouseEnter,
    handleTriggerMouseLeave: overlay.handleTriggerMouseLeave,
    applyTextColor: actions.applyTextColor,
    applyBackgroundColor: actions.applyBackgroundColor,
    handleQuickItemClick: actions.handleQuickItemClick,
    handleMenuItemClick: actions.handleMenuItemClick,
    handleAlignItemClick: actions.handleAlignItemClick,
    handlePickImageResult: actions.handlePickImageResult,
    handlePickFileResult: actions.handlePickFileResult,
    handleDragStart: drag.handleDragStart,
    handleDragEnd: drag.handleDragEnd,
  }
}
