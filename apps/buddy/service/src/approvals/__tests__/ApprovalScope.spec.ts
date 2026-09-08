import type { AppendBuddyRunEventInput } from '../../events/BuddyRunEvent'
import type {
  ApprovalRecord,
  ApprovalRepository,
  ApprovalStatus,
} from '../../storage/approvalRepository'
import { describe, expect, it, vi } from 'vitest'

import { ApprovalService } from '../ApprovalService'

describe('turn approval scope', () => {
  it('reuses approval for later approvable operations in the same turn only', async () => {
    const records = new Map<string, ApprovalRecord>()
    const repository = createRepository(records)
    const service = new ApprovalService({
      eventLog: { append: input => appendApprovalEvent(records, input) },
      repository,
    })
    const controller = new AbortController()
    const initial = service.request({
      allowForTurn: true,
      arguments: { command: 'npm view package version' },
      kind: 'network',
      runId: 'run-1',
      signal: controller.signal,
      summary: 'Access package metadata',
      toolCallId: 'tool-1',
      toolName: 'bash',
    })
    await vi.waitFor(() => expect(repository.listPending('run-1')).toHaveLength(1))
    await service.resolve({
      decision: 'approved_for_turn',
      id: repository.listPending('run-1')[0]!.id,
    })
    const sourceApprovalId = repository.list({ runId: 'run-1' })[0]!.id
    await expect(initial).resolves.toEqual({
      approvalId: sourceApprovalId,
      decision: 'approved_for_turn',
    })

    await expect(service.request({
      allowForTurn: true,
      arguments: { command: 'python process.py' },
      kind: 'shell',
      runId: 'run-1',
      signal: new AbortController().signal,
      summary: 'Run image processor',
      toolCallId: 'tool-2',
      toolName: 'bash',
    })).resolves.toEqual({
      decision: 'approved_by_turn',
      sourceApprovalId,
    })
    expect(repository.list({ runId: 'run-1' })).toHaveLength(1)

    const nextTurn = service.request({
      allowForTurn: true,
      arguments: { command: 'python process.py' },
      kind: 'shell',
      runId: 'run-2',
      signal: controller.signal,
      summary: 'Run image processor',
      toolCallId: 'tool-3',
      toolName: 'bash',
    })
    await vi.waitFor(() => expect(repository.listPending('run-2')).toHaveLength(1))
    const pending = repository.listPending('run-2')[0]!
    await service.resolve({ decision: 'denied', id: pending.id })
    await expect(nextTurn).resolves.toEqual({
      approvalId: pending.id,
      decision: 'denied',
    })

    service.clearTurnAuthorization('run-1')
    const clearedTurn = service.request({
      allowForTurn: true,
      arguments: { command: 'python process.py' },
      kind: 'shell',
      runId: 'run-1',
      signal: new AbortController().signal,
      summary: 'Run image processor',
      toolCallId: 'tool-4',
      toolName: 'bash',
    })
    await vi.waitFor(() => expect(repository.listPending('run-1')).toHaveLength(1))
    const clearedPending = repository.listPending('run-1')[0]!
    await service.resolve({ decision: 'denied', id: clearedPending.id })
    await expect(clearedTurn).resolves.toEqual({
      approvalId: clearedPending.id,
      decision: 'denied',
    })
  })
})

function createRepository(records: Map<string, ApprovalRecord>): ApprovalRepository {
  return {
    findById: id => records.get(id) ?? null,
    list: (options = {}) => [...records.values()]
      .filter(record => options.runId == null || record.runId === options.runId)
      .filter(record => options.status == null || record.status === options.status)
      .slice(0, options.limit ?? 100),
    listPending: runId => [...records.values()].filter(record => (
      record.status === 'pending' && (runId === undefined || record.runId === runId)
    )),
  }
}

function appendApprovalEvent(
  records: Map<string, ApprovalRecord>,
  input: AppendBuddyRunEventInput,
): Promise<unknown> {
  if (input.type === 'approval.requested') {
    const approval = input.payload as ApprovalRecord
    records.set(approval.id, approval)
  }
  if (input.type === 'approval.resolved') {
    const resolution = input.payload as {
      id: string
      resolvedAt: string
      status: ApprovalStatus
    }
    const approval = records.get(resolution.id)
    if (approval) {
      records.set(resolution.id, {
        ...approval,
        resolvedAt: resolution.resolvedAt,
        status: resolution.status,
      })
    }
  }
  return Promise.resolve(input)
}
