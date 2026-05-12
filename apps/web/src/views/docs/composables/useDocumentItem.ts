import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { DOCUMENT_COLLECTION, WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { useDocsContext } from './useDocsContext'
import { useDocsHistoryState } from './useDocsHistoryState'
import { useDocsPageActions } from './useDocsPageActions'
import { useDocsShareDialog } from './useDocsShareDialog'
import { useDocumentTree } from './useDocumentTree'

export interface UseDocumentItemOptions {
  item: () => DocumentItem
  collectionId: () => DocumentTreeCollectionId
}

export function useDocumentItem(options: UseDocumentItemOptions) {
  const { activeDocumentId, currentWorkspaceType } = useDocsContext()
  const tree = useDocumentTree()
  const pageActions = useDocsPageActions()
  const history = useDocsHistoryState()
  const { canOpenShareDialog, openDocumentShareDialog } = useDocsShareDialog()

  const item = computed(options.item)
  const collectionId = computed(options.collectionId)
  const isActive = computed(() => activeDocumentId.value === item.value.id)
  const isExpanded = computed(() => tree.expandedDocumentIdSet.value.has(item.value.id))
  const canManageDocument = computed(() =>
    collectionId.value !== DOCUMENT_COLLECTION.COLLABORATION,
  )
  const canMoveToTeam = computed(() =>
    currentWorkspaceType.value === WORKSPACE_TYPE.TEAM
    && collectionId.value === DOCUMENT_COLLECTION.PERSONAL
    && item.value.parentId === null,
  )
  const canShareDocument = computed(() =>
    canManageDocument.value && canOpenShareDialog.value,
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

  function moveDocumentToTeam() {
    void pageActions.moveDocumentToTeam(item.value.id)
  }

  function openHistory() {
    void history.openDocumentHistory(item.value.id)
  }

  function deleteDocument() {
    void tree.deleteDocument(item.value.id)
  }

  function handleMenuCommand(command: unknown) {
    if (command === 'history') {
      openHistory()
      return
    }

    if (command === 'share') {
      if (!canShareDocument.value) {
        return
      }

      shareDocument()
      return
    }

    if (command === 'move-to-team') {
      if (!canMoveToTeam.value) {
        return
      }

      moveDocumentToTeam()
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
    canMoveToTeam,
    canShareDocument,
    createChild,
    deleteDocument,
    getActionsStateClass,
    getExpandIconName,
    getItemStateClass,
    handleMenuCommand,
    isActionPending: tree.isMutatingTree,
    isActive,
    isExpanded,
    openDocument,
    toggleItem,
  }
}
