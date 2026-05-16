import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { DOCUMENT_COLLECTION } from '@haohaoxue/samepage-contracts'
import { buildDocumentPath } from '@haohaoxue/samepage-shared'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { useDocsContext } from './useDocsContext'
import { useDocsPageActions } from './useDocsPageActions'
import { useDocsShareDialog } from './useDocsShareDialog'
import { useDocumentTree } from './useDocumentTree'

export interface UseDocumentItemOptions {
  item: () => DocumentItem
  collectionId: () => DocumentTreeCollectionId
}

export function useDocumentItem(options: UseDocumentItemOptions) {
  const { activeDocumentId } = useDocsContext()
  const tree = useDocumentTree()
  const pageActions = useDocsPageActions()
  const { canOpenShareDialog, openDocumentShareDialog } = useDocsShareDialog()
  const { copy, isSupported: isClipboardSupported } = useClipboard({
    legacy: true,
  })

  const item = computed(options.item)
  const collectionId = computed(options.collectionId)
  const isActive = computed(() => activeDocumentId.value === item.value.id)
  const isExpanded = computed(() => tree.expandedDocumentIdSet.value.has(item.value.id))
  const canManageDocument = computed(() =>
    collectionId.value !== DOCUMENT_COLLECTION.COLLABORATION,
  )
  const canShareDocument = computed(() =>
    canManageDocument.value && canOpenShareDialog.value,
  )
  const isActionPending = computed(() =>
    tree.isMutatingTree.value || pageActions.isDocumentOperationRunning.value,
  )

  function openDocument() {
    void pageActions.openDocument(item.value.id)
  }

  function toggleItem() {
    if (!item.value.hasChildren) {
      return
    }

    tree.toggleDocument(item.value.id)
  }

  function createChild() {
    void tree.createChildDocument(item.value.id)
  }

  function shareDocument() {
    openDocumentShareDialog(item.value.id)
  }

  function openDocumentInNewTab() {
    window.open(buildDocumentPath(item.value.id), '_blank', 'noopener,noreferrer')
  }

  async function copyDocumentLink() {
    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copy(new URL(buildDocumentPath(item.value.id), window.location.origin).toString())
      ElMessage.success('链接已复制')
    }
    catch {
      ElMessage.error('复制链接失败')
    }
  }

  function duplicateDocument() {
    void pageActions.duplicateDocumentTree(item.value.id)
  }

  function moveDocument() {
    tree.openMoveDialog(item.value.id)
  }

  function renameDocument() {
    tree.openRenameDialog(item.value.id)
  }

  function deleteDocument() {
    void tree.deleteDocument(item.value.id)
  }

  function handleMenuCommand(command: unknown) {
    if (command === 'open-new-tab') {
      openDocumentInNewTab()
      return
    }

    if (command === 'share') {
      if (!canShareDocument.value) {
        return
      }

      shareDocument()
      return
    }

    if (command === 'copy-link') {
      void copyDocumentLink()
      return
    }

    if (command === 'duplicate') {
      if (!canManageDocument.value) {
        return
      }

      duplicateDocument()
      return
    }

    if (command === 'move') {
      if (!canManageDocument.value) {
        return
      }

      moveDocument()
      return
    }

    if (command === 'rename') {
      if (!canManageDocument.value) {
        return
      }

      renameDocument()
      return
    }

    if (command === 'delete') {
      if (!canManageDocument.value) {
        return
      }

      deleteDocument()
    }
  }

  function getItemStateClass() {
    return isActive.value ? 'active' : 'idle'
  }

  function getActionsStateClass() {
    return isActive.value ? 'visible' : 'hidden'
  }

  function getExpandIconName() {
    return isExpanded.value ? 'chevron-down' : 'chevron-right'
  }

  return {
    canManageDocument,
    canShareDocument,
    createChild,
    deleteDocument,
    getActionsStateClass,
    getExpandIconName,
    getItemStateClass,
    handleMenuCommand,
    isActionPending,
    isActive,
    isExpanded,
    openDocument,
    toggleItem,
  }
}
