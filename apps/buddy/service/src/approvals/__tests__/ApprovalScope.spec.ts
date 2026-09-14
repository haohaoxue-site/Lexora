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

    service.clearRunAuthorizations('run-1')
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

  it('distinguishes exact operations from their current source', async () => {
    const records = new Map<string, ApprovalRecord>()
    const repository = createRepository(records)
    const service = new ApprovalService({
      eventLog: { append: input => appendApprovalEvent(records, input) },
      repository,
    })
    const controller = new AbortController()
    const first = service.request(shellRequest('run-operation', 'tool-1', 'pnpm test', controller.signal))
    await vi.waitFor(() => expect(repository.listPending('run-operation')).toHaveLength(1))
    const operationApproval = repository.listPending('run-operation')[0]!
    await service.resolve({ decision: 'approved_for_operation', id: operationApproval.id })
    await expect(first).resolves.toMatchObject({ decision: 'approved_for_operation' })
    await expect(service.request(shellRequest('run-operation', 'tool-2', 'pnpm test', controller.signal))).resolves.toEqual({
      decision: 'approved_by_operation',
      sourceApprovalId: operationApproval.id,
    })

    const differentOperation = service.request(shellRequest('run-operation', 'tool-3', 'pnpm lint', controller.signal))
    await vi.waitFor(() => expect(repository.listPending('run-operation')).toHaveLength(1))
    const denied = repository.listPending('run-operation')[0]!
    await service.resolve({ decision: 'denied', id: denied.id })
    await expect(differentOperation).resolves.toMatchObject({ decision: 'denied' })

    const sourceRequest = service.request(shellRequest('run-source', 'tool-4', 'pnpm test', controller.signal))
    await vi.waitFor(() => expect(repository.listPending('run-source')).toHaveLength(1))
    const sourceApproval = repository.listPending('run-source')[0]!
    await service.resolve({ decision: 'approved_for_source', id: sourceApproval.id })
    await expect(sourceRequest).resolves.toMatchObject({ decision: 'approved_for_source' })
    await expect(service.request(shellRequest('run-source', 'tool-5', 'pnpm lint', controller.signal))).resolves.toEqual({
      decision: 'approved_by_source',
      sourceApprovalId: sourceApproval.id,
    })
  })

  it('normalizes file targets before reusing an operation approval', async () => {
    const records = new Map<string, ApprovalRecord>()
    const repository = createRepository(records)
    const service = new ApprovalService({
      eventLog: { append: input => appendApprovalEvent(records, input) },
      repository,
    })
    const signal = new AbortController().signal
    const first = service.request(pathRequest('run-path', 'tool-path-1', 'notes/todo.md', signal))
    await vi.waitFor(() => expect(repository.listPending('run-path')).toHaveLength(1))
    const approved = repository.listPending('run-path')[0]!
    await service.resolve({ decision: 'approved_for_operation', id: approved.id })
    await first

    await expect(service.request(pathRequest('run-path', 'tool-path-2', '/workspace/notes/todo.md', signal))).resolves.toEqual({
      decision: 'approved_by_operation',
      sourceApprovalId: approved.id,
    })

    const changed = service.request(pathRequest('run-path', 'tool-path-3', '/workspace/notes/done.md', signal))
    await vi.waitFor(() => expect(repository.listPending('run-path')).toHaveLength(1))
    const changedApproval = repository.listPending('run-path')[0]!
    await service.resolve({ decision: 'denied', id: changedApproval.id })
    await expect(changed).resolves.toMatchObject({ decision: 'denied' })
  })

  it('reuses MCP tools across arguments but invalidates connector generations', async () => {
    const records = new Map<string, ApprovalRecord>()
    const repository = createRepository(records)
    const service = new ApprovalService({
      eventLog: { append: input => appendApprovalEvent(records, input) },
      repository,
    })
    const signal = new AbortController().signal
    const initial = service.request({
      allowForTurn: true,
      arguments: { query: 'first' },
      kind: 'mcp',
      reuse: { operation: ['calendar', 3, 'search'], source: ['calendar', 3] },
      runId: 'run-mcp',
      signal,
      summary: 'Calendar: search',
      toolCallId: 'tool-mcp-1',
      toolName: 'mcp__calendar__search',
    })
    await vi.waitFor(() => expect(repository.listPending('run-mcp')).toHaveLength(1))
    const approved = repository.listPending('run-mcp')[0]!
    await service.resolve({ decision: 'approved_for_operation', id: approved.id })
    await initial
    await expect(service.request({
      allowForTurn: true,
      arguments: { query: 'second' },
      kind: 'mcp',
      reuse: { operation: ['calendar', 3, 'search'], source: ['calendar', 3] },
      runId: 'run-mcp',
      signal,
      summary: 'Calendar: search',
      toolCallId: 'tool-mcp-2',
      toolName: 'mcp__calendar__search',
    })).resolves.toMatchObject({ decision: 'approved_by_operation' })

    const changed = service.request({
      allowForTurn: true,
      arguments: { query: 'third' },
      kind: 'mcp',
      reuse: { operation: ['calendar', 4, 'search'], source: ['calendar', 4] },
      runId: 'run-mcp',
      signal,
      summary: 'Calendar: search',
      toolCallId: 'tool-mcp-3',
      toolName: 'mcp__calendar__search',
    })
    await vi.waitFor(() => expect(repository.listPending('run-mcp')).toHaveLength(1))
    const changedApproval = repository.listPending('run-mcp')[0]!
    await service.resolve({ decision: 'denied', id: changedApproval.id })
    await expect(changed).resolves.toMatchObject({ decision: 'denied' })
  })

  it('rejects every reusable scope for explicitly single-use approvals', async () => {
    const records = new Map<string, ApprovalRecord>()
    const repository = createRepository(records)
    const service = new ApprovalService({
      eventLog: { append: input => appendApprovalEvent(records, input) },
      repository,
    })
    const request = service.request({
      allowForTurn: false,
      arguments: { command: 'systemctl restart fixture' },
      kind: 'shell',
      runId: 'run-single-use',
      signal: new AbortController().signal,
      summary: 'Restart a system service',
      toolCallId: 'tool-single-use',
      toolName: 'bash',
    })
    await vi.waitFor(() => expect(repository.listPending('run-single-use')).toHaveLength(1))
    const approval = repository.listPending('run-single-use')[0]!
    for (const scope of ['operation', 'source', 'turn'] as const) {
      await expect(service.resolve({ decision: `approved_for_${scope}`, id: approval.id }))
        .rejects
        .toMatchObject({ code: 'APPROVAL_NOT_PENDING' })
    }
    await service.resolve({ decision: 'denied', id: approval.id })
    await expect(request).resolves.toMatchObject({ decision: 'denied' })
  })
})

function shellRequest(runId: string, toolCallId: string, command: string, signal: AbortSignal) {
  return {
    allowForTurn: true,
    arguments: { command },
    kind: 'shell' as const,
    runId,
    signal,
    shell: { cwd: '/workspace', reason: 'manual-policy' as const },
    summary: 'Run a host shell command',
    toolCallId,
    toolName: 'bash',
  }
}

function pathRequest(runId: string, toolCallId: string, path: string, signal: AbortSignal) {
  return {
    allowForTurn: true,
    arguments: { path },
    cwd: '/workspace',
    kind: 'write' as const,
    paths: {
      access: 'write' as const,
      grant: null,
      targets: [{ path, zone: 'workspace' as const }],
    },
    runId,
    signal,
    summary: 'Write a file',
    toolCallId,
    toolName: 'write_file',
  }
}

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
