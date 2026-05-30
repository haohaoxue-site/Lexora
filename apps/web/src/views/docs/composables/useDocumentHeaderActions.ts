import type { DocumentPageWidthMode } from '@haohaoxue/samepage-contracts'
import { DOCUMENT_PAGE_WIDTH_MODE } from '@haohaoxue/samepage-contracts'
import {
  buildSharedDocumentPath,
  isDocumentLinkShareMode,
} from '@haohaoxue/samepage-shared'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { patchDocumentLayout } from '@/apis/document'
import { useActiveDocument } from './useActiveDocument'
import { useDocsChatPanel } from './useDocsChatPanel'
import { useDocsHistoryState } from './useDocsHistoryState'
import { useDocsShareDialog } from './useDocsShareDialog'

export function useDocumentHeaderActions() {
  const { currentDocument, patchDocumentPageWidthMode } = useActiveDocument()
  const {
    isOpen: isDocsChatPanelOpen,
    togglePanel: toggleDocsChatPanel,
  } = useDocsChatPanel()
  const { openHistoryMode } = useDocsHistoryState()
  const { canOpenShareDialog, openDocumentShareDialog } = useDocsShareDialog()
  const isPageWidthUpdating = shallowRef(false)
  const {
    copied: isShareLinkCopied,
    copy: copyShareLinkText,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })

  const documentId = computed(() => currentDocument.value?.id ?? '')
  const currentPageWidthMode = computed<DocumentPageWidthMode>(() =>
    currentDocument.value?.pageWidthMode ?? DOCUMENT_PAGE_WIDTH_MODE.DEFAULT,
  )
  const effectivePolicy = computed(() => currentDocument.value?.share?.effectivePolicy ?? null)
  const shareLinkPath = computed(() => {
    const policy = effectivePolicy.value

    if (!policy || !isDocumentLinkShareMode(policy.mode)) {
      return ''
    }

    return buildSharedDocumentPath(policy.shareId)
  })
  const fullShareLink = computed(() => {
    if (!shareLinkPath.value) {
      return ''
    }

    return new URL(shareLinkPath.value, window.location.origin).toString()
  })
  const shouldShowShareLink = computed(() => Boolean(fullShareLink.value))
  const isShareButtonDisabled = computed(() => !documentId.value || !canOpenShareDialog.value)

  function openShareDialog() {
    if (!documentId.value) {
      return
    }

    openDocumentShareDialog(documentId.value)
  }

  async function copyShareLink() {
    if (!fullShareLink.value) {
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copyShareLinkText(fullShareLink.value)
      ElMessage.success('分享链接已复制')
    }
    catch {
      ElMessage.error('复制链接失败，请手动复制')
    }
  }

  async function handlePageWidthOptionClick(pageWidthMode: DocumentPageWidthMode) {
    if (!documentId.value || currentPageWidthMode.value === pageWidthMode || isPageWidthUpdating.value) {
      return
    }

    const currentDocumentId = documentId.value
    const previousPageWidthMode = currentPageWidthMode.value
    isPageWidthUpdating.value = true
    patchDocumentPageWidthMode(currentDocumentId, pageWidthMode)

    try {
      await patchDocumentLayout(currentDocumentId, {
        pageWidthMode,
      })
    }
    catch {
      patchDocumentPageWidthMode(currentDocumentId, previousPageWidthMode)
      ElMessage.error('页宽设置失败，请稍后重试')
    }
    finally {
      isPageWidthUpdating.value = false
    }
  }

  function handleMenuCommand(command: unknown) {
    if (command === 'document-info') {
      ElMessage.info('文档信息能力稍后接入')
      return
    }

    if (command === 'history') {
      void openHistoryMode()
    }
  }

  return {
    currentPageWidthMode,
    handleMenuCommand,
    handlePageWidthOptionClick,
    isDocsChatPanelOpen,
    isShareButtonDisabled,
    isShareLinkCopied,
    openShareDialog,
    shouldShowShareLink,
    toggleDocsChatPanel,
    copyShareLink,
  }
}
