import type { DocumentPageWidthMode } from '@haohaoxue/samepage-contracts'
import { DOCUMENT_PAGE_WIDTH_MODE } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { patchDocumentLayout } from '@/apis/document'
import { useActiveDocument } from './useActiveDocument'
import { useDocsChatPanel } from './useDocsChatPanel'
import { useDocsCollaborationDialog } from './useDocsCollaborationDialog'
import { useDocsHistoryState } from './useDocsHistoryState'
import { useDocsPublicationDialog } from './useDocsPublicationDialog'

export function useDocumentHeaderActions() {
  const { currentDocument, patchDocumentPageWidthMode } = useActiveDocument()
  const {
    isOpen: isDocsChatPanelOpen,
    togglePanel: toggleDocsChatPanel,
  } = useDocsChatPanel()
  const { openHistoryMode } = useDocsHistoryState()
  const { openDocumentCollaborationDialog } = useDocsCollaborationDialog()
  const { openDocumentPublicationDialog } = useDocsPublicationDialog()
  const isPageWidthUpdating = shallowRef(false)

  const documentId = computed(() => currentDocument.value?.id ?? '')
  const currentPageWidthMode = computed<DocumentPageWidthMode>(() =>
    currentDocument.value?.pageWidthMode ?? DOCUMENT_PAGE_WIDTH_MODE.DEFAULT,
  )
  const canShowCollaborationButton = computed(() =>
    Boolean(documentId.value && currentDocument.value?.access.capabilities.canManageCollaboration),
  )
  const canShowPublicationButton = computed(() =>
    Boolean(documentId.value && currentDocument.value?.access.capabilities.canPublish),
  )

  function openCollaborationDialog() {
    if (!documentId.value) {
      return
    }

    openDocumentCollaborationDialog(documentId.value)
  }

  function openPublicationDialog() {
    if (!documentId.value) {
      return
    }

    openDocumentPublicationDialog(documentId.value)
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
    canShowCollaborationButton,
    canShowPublicationButton,
    openCollaborationDialog,
    openPublicationDialog,
    toggleDocsChatPanel,
  }
}
