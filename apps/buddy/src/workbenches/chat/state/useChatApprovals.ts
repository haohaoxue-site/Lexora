import type { LocalApproval, LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { computed, readonly, shallowRef } from 'vue'

export type ChatApprovalDecision = 'approve' | 'approveForTurn' | 'deny'

interface UseChatApprovalsOptions {
  api: LocalChatApi
  approvals: Ref<ReadonlyArray<LocalApproval>>
  onError: (error: unknown) => void
  refresh: () => Promise<void>
}

export function useChatApprovals(options: UseChatApprovalsOptions) {
  const resolvingApprovalActions = shallowRef<ReadonlyMap<string, ChatApprovalDecision>>(new Map())
  const resolvingApprovalIds = computed<ReadonlySet<string>>(
    () => new Set(resolvingApprovalActions.value.keys()),
  )

  async function resolveApproval(
    approvalId: string,
    decision: ChatApprovalDecision,
  ) {
    if (resolvingApprovalActions.value.has(approvalId))
      return
    const approval = options.approvals.value.find(item => item.id === approvalId)
    if (!approval || approval.status !== 'pending')
      return

    resolvingApprovalActions.value = new Map([
      ...resolvingApprovalActions.value,
      [approvalId, decision],
    ])
    try {
      if (decision === 'approve')
        await options.api.approvals.approve(approvalId)
      else if (decision === 'approveForTurn')
        await options.api.approvals.approveForTurn(approvalId)
      else
        await options.api.approvals.deny(approvalId)
      await options.refresh()
    }
    catch (error) {
      options.onError(error)
    }
    finally {
      const next = new Map(resolvingApprovalActions.value)
      next.delete(approvalId)
      resolvingApprovalActions.value = next
    }
  }

  return {
    approvalViews: options.approvals,
    resolveApproval,
    resolvingApprovalActions: readonly(resolvingApprovalActions),
    resolvingApprovalIds,
  }
}
