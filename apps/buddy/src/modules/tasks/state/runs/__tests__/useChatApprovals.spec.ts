import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { LocalApproval } from '@buddy-shared/permissions/approvalApi'
import { deferred } from '@buddy-tests/deferred'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { useChatApprovals } from '../useChatApprovals'

const timestamp = '2026-08-28T00:00:00.000Z'

describe('useChatApprovals', () => {
  it('exposes the action currently resolving for each approval', async () => {
    const approval = pendingApproval()
    const resolution = deferred<LocalApproval>()
    const approvals = useChatApprovals({
      api: {
        approvals: {
          approve: vi.fn(),
          approveForTurn: vi.fn(() => resolution.promise),
          deny: vi.fn(),
        },
      } as unknown as LocalChatApi,
      approvals: shallowRef([approval]),
      onError: vi.fn(),
      refresh: vi.fn(async () => {}),
    })

    const resolving = approvals.resolveApproval(approval.id, 'approveForTurn')

    expect(approvals.resolvingApprovalActions.value.get(approval.id)).toBe('approveForTurn')
    expect(approvals.resolvingApprovalIds.value.has(approval.id)).toBe(true)

    resolution.resolve({
      ...approval,
      resolvedAt: timestamp,
      status: 'approved',
    })
    await resolving

    expect(approvals.resolvingApprovalActions.value.has(approval.id)).toBe(false)
    expect(approvals.resolvingApprovalIds.value.has(approval.id)).toBe(false)
  })
})

function pendingApproval(): LocalApproval {
  return {
    createdAt: timestamp,
    id: 'approval-1',
    kind: 'shell',
    payload: {
      allowForTurn: true,
      card: 'shell',
      command: 'npm view package version',
      toolName: 'bash',
    },
    resolvedAt: null,
    runId: 'run-1',
    status: 'pending',
    summary: 'Run a host shell command from the current workspace',
    toolCallId: 'tool-call-1',
  }
}
