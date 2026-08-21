import type { LocalApproval, LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { readonly, shallowRef } from 'vue'

interface UseChatApprovalsOptions {
  api: LocalChatApi
  approvals: Ref<ReadonlyArray<LocalApproval>>
  onError: (error: unknown) => void
  refresh: () => Promise<void>
}

export function useChatApprovals(options: UseChatApprovalsOptions) {
  const resolvingApprovalIds = shallowRef<ReadonlySet<string>>(new Set())

  async function resolveApproval(approvalId: string, decision: 'approve' | 'deny') {
    if (resolvingApprovalIds.value.has(approvalId))
      return
    const approval = options.approvals.value.find(item => item.id === approvalId)
    if (!approval || approval.status !== 'pending')
      return

    resolvingApprovalIds.value = new Set([...resolvingApprovalIds.value, approvalId])
    try {
      if (decision === 'approve')
        await options.api.approvals.approve(approvalId)
      else
        await options.api.approvals.deny(approvalId)
      await options.refresh()
    }
    catch (error) {
      options.onError(error)
    }
    finally {
      const next = new Set(resolvingApprovalIds.value)
      next.delete(approvalId)
      resolvingApprovalIds.value = next
    }
  }

  return {
    approvalViews: options.approvals,
    resolveApproval,
    resolvingApprovalIds: readonly(resolvingApprovalIds),
  }
}
