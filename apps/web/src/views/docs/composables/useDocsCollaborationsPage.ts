import type { DocumentCollaborationConsoleItem } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listDocumentCollaborationConsoleItems } from '@/apis/document-collaboration'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useDocsCollaborationDialog } from './useDocsCollaborationDialog'

export function useDocsCollaborationsPage() {
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()
  const { openDocumentCollaborationDialog } = useDocsCollaborationDialog()
  const items = shallowRef<DocumentCollaborationConsoleItem[]>([])
  const isLoading = shallowRef(false)
  const errorMessage = shallowRef('')
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
  let loadRequestId = 0

  watch(currentWorkspaceId, async () => {
    await loadItems()
  }, {
    immediate: true,
  })

  return {
    errorMessage,
    isLoading,
    items,
    loadItems,
    openCollaborationDetail,
    openDocument,
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
      const response = await listDocumentCollaborationConsoleItems(workspaceId)

      if (requestId !== loadRequestId) {
        return
      }

      items.value = response.items
    }
    catch (error) {
      if (requestId !== loadRequestId) {
        return
      }

      items.value = []
      errorMessage.value = getRequestErrorDisplayMessage(error, '协作管理加载失败')
    }
    finally {
      if (requestId === loadRequestId) {
        isLoading.value = false
      }
    }
  }

  function openCollaborationDetail(documentId: string) {
    openDocumentCollaborationDialog(documentId)
  }

  async function openDocument(documentId: string) {
    try {
      await router.push({
        name: 'docs',
        params: {
          id: documentId,
        },
      })
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '打开文档失败'))
    }
  }
}
