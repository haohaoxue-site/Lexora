import type { DocumentTrashItem } from '@haohaoxue/samepage-contracts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import {
  getTrashDocuments,
  permanentlyDeleteDocument,
  restoreDocumentFromTrash,
} from '@/apis/document'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function useDocsTrashPage() {
  const workspaceStore = useWorkspaceStore()
  const items = shallowRef<DocumentTrashItem[]>([])
  const isLoading = shallowRef(false)
  const errorMessage = shallowRef('')
  const actionItemId = shallowRef('')
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
  let loadRequestId = 0

  watch(currentWorkspaceId, async () => {
    await loadItems()
  }, {
    immediate: true,
  })

  return {
    items,
    isLoading,
    errorMessage,
    actionItemId,
    loadItems,
    restoreItem,
    permanentlyDeleteItem,
  }

  async function loadItems() {
    const workspaceId = currentWorkspaceId.value
    const requestId = ++loadRequestId

    if (!workspaceId) {
      items.value = []
      errorMessage.value = ''
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      const nextItems = await getTrashDocuments(workspaceId)

      if (requestId !== loadRequestId) {
        return
      }

      items.value = nextItems
    }
    catch (error) {
      if (requestId !== loadRequestId) {
        return
      }

      items.value = []
      errorMessage.value = getRequestErrorDisplayMessage(error, '回收站加载失败')
    }
    finally {
      if (requestId === loadRequestId) {
        isLoading.value = false
      }
    }
  }

  async function restoreItem(documentId: string) {
    if (actionItemId.value) {
      return
    }

    actionItemId.value = documentId

    try {
      await restoreDocumentFromTrash(documentId)
      items.value = items.value.filter(item => item.id !== documentId)
      ElMessage.success('已恢复文档')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '恢复文档失败'))
    }
    finally {
      if (actionItemId.value === documentId) {
        actionItemId.value = ''
      }
    }
  }

  async function permanentlyDeleteItem(documentId: string) {
    if (actionItemId.value) {
      return
    }

    const targetItem = items.value.find(item => item.id === documentId)
    const confirmed = await ElMessageBox.confirm(
      `将彻底删除「${targetItem?.title ?? '该文档'}」及其所有子文档，同时清理相关分享记录。`,
      '彻底删除文档',
      {
        type: 'warning',
        confirmButtonText: '彻底删除',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    actionItemId.value = documentId

    try {
      await permanentlyDeleteDocument(documentId)
      items.value = items.value.filter(item => item.id !== documentId)
      ElMessage.success('已彻底删除文档')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '彻底删除文档失败'))
    }
    finally {
      if (actionItemId.value === documentId) {
        actionItemId.value = ''
      }
    }
  }
}
