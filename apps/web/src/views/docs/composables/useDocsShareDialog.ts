import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { canManageDocumentShare } from '@haohaoxue/samepage-shared'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'

export const useDocsShareDialog = createSharedComposable(() => {
  const workspaceStore = useWorkspaceStore()
  const shareDialogDocumentId = shallowRef('')
  const isShareDialogOpen = computed(() => Boolean(shareDialogDocumentId.value))

  const canOpenShareDialog = computed(() => {
    const currentWorkspace = workspaceStore.currentWorkspace

    if (!currentWorkspace) {
      return workspaceStore.currentWorkspaceType !== WORKSPACE_TYPE.TEAM
    }

    if (currentWorkspace.type === WORKSPACE_TYPE.PERSONAL) {
      return true
    }

    return canManageDocumentShare({
      workspaceType: currentWorkspace.type,
      workspaceMemberRole: currentWorkspace.role,
    })
  })

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
