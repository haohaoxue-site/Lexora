import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'

export const useDocsShareDialog = createSharedComposable(() => {
  const shareDialogDocumentId = shallowRef('')
  const isShareDialogOpen = computed(() => Boolean(shareDialogDocumentId.value))
  const canOpenShareDialog = computed(() => true)

  function openDocumentShareDialog(documentId: string) {
    if (!canOpenShareDialog.value) {
      ElMessage.warning('仅 MAINTAINER 可以管理分享设置')
      return
    }

    shareDialogDocumentId.value = documentId
  }

  function handleShareDialogVisibleChange(visible: boolean) {
    if (visible) {
      return
    }

    shareDialogDocumentId.value = ''
  }

  return {
    canOpenShareDialog,
    handleShareDialogVisibleChange,
    isShareDialogOpen,
    openDocumentShareDialog,
    shareDialogDocumentId,
  }
})
