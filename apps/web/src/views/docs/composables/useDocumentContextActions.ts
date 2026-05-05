import type { DocumentContextActionsProps } from '../typing'
import { shallowRef } from 'vue'

export function useDocumentContextActions(
  props: DocumentContextActionsProps,
  options: {
    onOpenHistory: () => void
    onMoveDocumentToTeam: () => void
    onDeleteDocument: () => void
  },
) {
  const menuVisible = shallowRef(false)

  function closeMenu() {
    menuVisible.value = false
  }

  function handleVisibleChange(visible: boolean) {
    menuVisible.value = visible
  }

  function openHistory() {
    closeMenu()
    options.onOpenHistory()
  }

  function deleteDocument() {
    if (!props.canDeleteDocument) {
      return
    }

    closeMenu()
    options.onDeleteDocument()
  }

  function moveDocumentToTeam() {
    if (!props.canMoveToTeam) {
      return
    }

    closeMenu()
    options.onMoveDocumentToTeam()
  }

  function handleCommand(command: unknown) {
    if (command === 'history') {
      openHistory()
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

  return {
    menuVisible,
    deleteDocument,
    handleCommand,
    handleVisibleChange,
    moveDocumentToTeam,
    openHistory,
  }
}
