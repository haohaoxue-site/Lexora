import { createSharedComposable } from '@vueuse/core'
import { computed, shallowRef } from 'vue'

export const useDocsCollaborationDialog = createSharedComposable(() => {
  const collaborationDialogDocumentId = shallowRef('')
  const isCollaborationDialogOpen = computed(() => Boolean(collaborationDialogDocumentId.value))

  function openDocumentCollaborationDialog(documentId: string) {
    collaborationDialogDocumentId.value = documentId
  }

  function handleCollaborationDialogVisibleChange(visible: boolean) {
    if (visible) {
      return
    }

    collaborationDialogDocumentId.value = ''
  }

  return {
    collaborationDialogDocumentId,
    handleCollaborationDialogVisibleChange,
    isCollaborationDialogOpen,
    openDocumentCollaborationDialog,
  }
})
