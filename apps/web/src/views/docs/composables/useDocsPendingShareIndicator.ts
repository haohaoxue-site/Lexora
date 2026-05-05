import type { WorkspaceType } from '@haohaoxue/samepage-contracts'
import type { ComputedRef } from 'vue'
import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { computed, shallowRef, watch } from 'vue'
import { getPendingDocumentShareRecipients } from '@/apis/document-share'

/**
 * 待接收分享提示参数。
 */
interface UseDocsPendingShareIndicatorOptions {
  routeKey: ComputedRef<string>
  currentWorkspaceType: ComputedRef<WorkspaceType>
}

export function useDocsPendingShareIndicator(options: UseDocsPendingShareIndicatorOptions) {
  const pendingShareCount = shallowRef(0)
  const isLoading = shallowRef(false)
  const hasPendingShares = computed(() => pendingShareCount.value > 0)
  let requestId = 0

  watch(
    [options.routeKey, options.currentWorkspaceType],
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
    pendingShareCount,
    hasPendingShares,
    isLoading,
  }
}
