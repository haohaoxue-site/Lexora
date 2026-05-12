import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { getPendingDocumentShareRecipients } from '@/apis/document-share'
import { useDocsContext } from './useDocsContext'

export const useDocsPendingShareIndicator = createSharedComposable(() => {
  const { routeKey, currentWorkspaceType } = useDocsContext()
  const pendingShareCount = shallowRef(0)
  const isLoading = shallowRef(false)
  const hasPendingShares = computed(() => pendingShareCount.value > 0)
  let requestId = 0

  watch(
    [routeKey, currentWorkspaceType],
    async ([, workspaceType]) => {
      if (workspaceType !== WORKSPACE_TYPE.PERSONAL) {
        pendingShareCount.value = 0
        isLoading.value = false
        return
      }

      const currentRequestId = ++requestId

      isLoading.value = true

      try {
        const items = await getPendingDocumentShareRecipients()

        if (currentRequestId !== requestId) {
          return
        }

        pendingShareCount.value = items.length
      }
      catch {
        if (currentRequestId !== requestId) {
          return
        }

        pendingShareCount.value = 0
      }
      finally {
        if (currentRequestId === requestId) {
          isLoading.value = false
        }
      }
    },
    {
      immediate: true,
    },
  )

  return {
    hasPendingShares,
    isLoading,
    pendingShareCount,
  }
})
