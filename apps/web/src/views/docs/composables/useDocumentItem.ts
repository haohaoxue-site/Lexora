import type { DocumentItemProps } from '../typing'
import { DOCUMENT_COLLECTION, WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'

export function useDocumentItem(
  props: DocumentItemProps,
  options: {
    onDeleteDocument: (documentId: string) => void
    onMoveDocumentToTeam: (documentId: string) => void
    onOpen: (documentId: string) => void
    onShareDocument: (documentId: string) => void
    onToggle: (documentId: string) => void
  },
) {
  const isActive = computed(() => props.activeDocumentId === props.item.id)
  const isExpanded = computed(() => props.expandedDocumentIds.has(props.item.id))
  const canManageDocument = computed(() =>
    props.collectionId !== DOCUMENT_COLLECTION.COLLABORATION,
  )
  const canMoveToTeam = computed(() =>
    props.currentWorkspaceType === WORKSPACE_TYPE.TEAM
    && props.collectionId === DOCUMENT_COLLECTION.PERSONAL
    && props.item.parentId === null,
  )
  const canShareDocument = computed(() =>
    canManageDocument.value && props.canShareDocument,
  )

  function openDocument() {
    options.onOpen(props.item.id)
  }

  function toggleItem() {
    if (!props.item.hasChildren) {
      return
    }

    options.onToggle(props.item.id)
  }

  function shareDocument() {
    options.onShareDocument(props.item.id)
  }

  function moveDocumentToTeam() {
    options.onMoveDocumentToTeam(props.item.id)
  }

  function deleteDocument() {
    options.onDeleteDocument(props.item.id)
  }

  function handleMenuCommand(command: unknown) {
    if (command === 'share') {
      if (!canShareDocument.value) {
        return
      }

      shareDocument()
      return
    }

    if (command === 'move-to-team') {
      moveDocumentToTeam()
      return
    }

    if (command === 'delete') {
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
    canMoveToTeam,
    getActionsStateClass,
    getExpandIconName,
    getItemStateClass,
    handleMenuCommand,
    isExpanded,
    moveDocumentToTeam,
    openDocument,
    shareDocument,
    toggleItem,
  }
}
