import type { DatabaseSync } from 'node:sqlite'
import type { AppendBuddyRunEventInput } from '../../events/BuddyRunEvent'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deferred } from '@buddy-tests/deferred'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRunEventLog } from '../../events/createRunEventLog'
import { prepareTestTurnRequest } from '../../storage/__tests__/composerDraftTestFixture'
import { createApprovalRepository } from '../../storage/approvalRepository'
import { openBuddyDatabase } from '../../storage/database'
import {
  ApprovalCancelledError,
  ApprovalExpiredError,
  ApprovalService,
} from '../ApprovalService'

const databases: DatabaseSync[] = []
const directories: string[] = []
const BROWSER_REVIEW = {
  action: 'click' as const,
  actionDigest: 'a'.repeat(64),
  documentRevision: 2,
  effect: 'delete' as const,
  key: null,
  observationId: 'b3a5d63b-17b7-4b5a-863a-37f135e297d4',
  origin: 'https://example.com',
  pageId: 'ed312709-baf9-44b3-a292-108055838477',
  risk: 'commit-like' as const,
  sessionId: '6f828cc1-6549-4245-b26e-43b2917c9281',
  targetName: 'Delete report',
  targetRole: 'button',
}

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('approvalService', () => {
  it('cancels a durable approval and closes its run when the wait expires', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-timeout',
      conversationId: 'conversation-timeout',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-timeout',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-timeout',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-timeout',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-timeout',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const onExpired = vi.fn()
    const service = new ApprovalService({
      approvalTimeoutMs: 5,
      eventLog,
      onExpired,
      repository,
    })

    const decision = service.request({
      allowForTurn: false,
      arguments: { operation: 'upsert' },
      automation: {
        executionProfile: 'workspace_write',
        modelMode: 'default',
        name: 'Daily review',
        operation: 'upsert',
        spaceId: null,
        promptSummary: 'Review the day',
        scheduleSummary: 'daily at 18:00',
        timezone: 'Asia/Shanghai',
      },
      kind: 'automation',
      runId: 'run-timeout',
      signal: new AbortController().signal,
      summary: 'Save automation Daily review',
      toolCallId: 'tool-timeout',
      toolName: 'lexora_buddy_automation',
    })

    await expect(decision).rejects.toBeInstanceOf(ApprovalExpiredError)
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledWith('run-timeout'))
    expect(repository.listPending('run-timeout')).toEqual([])
    expect(repository.list({ runId: 'run-timeout' })[0]).toMatchObject({
      kind: 'automation',
      status: 'cancelled',
    })
  })

  it('expires a durable browser approval once while preserving its review payload', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-browser-timeout',
      conversationId: 'conversation-browser-timeout',
      createdAt: '2026-09-02T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      model: 'model-1',
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-browser-timeout',
      requestId: 'request-browser-timeout',
      runId: 'run-browser-timeout',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'delete the report',
        reasoning: null,
        serviceTier: null,
      },
      spaceId: null,
      title: null,
      userMessageContent: { text: 'delete the report' },
      userMessageId: 'message-browser-timeout',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const onExpired = vi.fn()
    const service = new ApprovalService({
      approvalTimeoutMs: 5,
      eventLog,
      onExpired,
      repository,
    })

    const decision = service.request({
      allowForTurn: false,
      arguments: { action: { kind: 'click', ref: 'e1' } },
      browser: BROWSER_REVIEW,
      kind: 'browser',
      runId: 'run-browser-timeout',
      signal: new AbortController().signal,
      summary: 'Delete content in the browser',
      toolCallId: 'tool-browser-timeout',
      toolName: 'lexora_browser_act',
    })

    await expect(decision).rejects.toBeInstanceOf(ApprovalExpiredError)
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledExactlyOnceWith(
      'run-browser-timeout',
    ))
    expect(repository.listPending('run-browser-timeout')).toEqual([])
    expect(repository.list({ runId: 'run-browser-timeout' })[0]).toMatchObject({
      kind: 'browser',
      payload: {
        actionDigest: BROWSER_REVIEW.actionDigest,
        card: 'browser-action',
        effect: 'delete',
        targetName: 'Delete report',
      },
      status: 'cancelled',
    })
  })

  it('does not persist an approval when its durable request event cannot be appended', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-request-failure',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-request-failure',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-request-failure',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-request-failure',
    })
    const repository = createApprovalRepository(database)
    const service = new ApprovalService({
      eventLog: { append: vi.fn().mockRejectedValue(new Error('event storage unavailable')) },
      repository,
    })

    await expect(service.request({
      allowForTurn: true,
      arguments: { command: 'pnpm test' },
      kind: 'shell',
      runId: 'run-request-failure',
      signal: new AbortController().signal,
      summary: 'Run tests',
      toolCallId: 'tool-request-failure',
      toolName: 'bash',
    })).rejects.toThrow('event storage unavailable')
    expect(repository.list({ runId: 'run-request-failure' })).toEqual([])
  })

  it('allows eligible approvals only for the active turn and preserves explicit confirmations', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-turn-approval',
      conversationId: 'conversation-turn-approval',
      createdAt: '2026-08-28T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-turn-approval',
      requestId: 'request-turn-approval',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'inspect dependencies',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-turn-approval',
      title: null,
      userMessageContent: { text: 'inspect dependencies' },
      userMessageId: 'message-turn-approval',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const service = new ApprovalService({ eventLog, repository })
    const controller = new AbortController()

    const initialDecision = service.request({
      allowForTurn: true,
      arguments: { command: 'npm view package version' },
      kind: 'network',
      runId: 'run-turn-approval',
      signal: controller.signal,
      summary: 'Access package metadata',
      toolCallId: 'tool-initial',
      toolName: 'bash',
    })
    await vi.waitFor(() => expect(repository.listPending('run-turn-approval')).toHaveLength(1))
    const initialApproval = repository.listPending('run-turn-approval')[0]!

    await expect(service.resolve({
      decision: 'approved_for_turn',
      id: initialApproval.id,
    })).resolves.toMatchObject({ status: 'approved' })
    await expect(initialDecision).resolves.toEqual({
      approvalId: initialApproval.id,
      decision: 'approved_for_turn',
    })

    await expect(service.request({
      allowForTurn: true,
      arguments: { command: 'python process.py' },
      kind: 'shell',
      runId: 'run-turn-approval',
      signal: controller.signal,
      summary: 'Run image processor',
      toolCallId: 'tool-follow-up',
      toolName: 'bash',
    })).resolves.toEqual({
      decision: 'approved_by_turn',
      sourceApprovalId: initialApproval.id,
    })
    const auditEvents = database.prepare(`
      SELECT event_type, payload_json FROM run_events
      WHERE run_id = 'run-turn-approval'
      ORDER BY sequence
    `).all() as Array<{ event_type: string, payload_json: string }>
    expect(auditEvents.map(event => ({
      payload: JSON.parse(event.payload_json),
      type: event.event_type,
    }))).toEqual(expect.arrayContaining([
      {
        payload: expect.objectContaining({
          id: initialApproval.id,
          resolution: 'approved_for_turn',
          status: 'approved',
        }),
        type: 'approval.resolved',
      },
      {
        payload: {
          sourceApprovalId: initialApproval.id,
          toolCallId: 'tool-follow-up',
          toolName: 'bash',
        },
        type: 'approval.turn_reused',
      },
    ]))
    expect(repository.list({ runId: 'run-turn-approval' })).toHaveLength(1)

    const explicitDecision = service.request({
      allowForTurn: false,
      arguments: { operation: 'upsert' },
      automation: {
        executionProfile: 'workspace_write',
        modelMode: 'default',
        name: 'Daily review',
        operation: 'upsert',
        spaceId: null,
        promptSummary: 'Review the day',
        scheduleSummary: 'daily at 18:00',
        timezone: 'Asia/Shanghai',
      },
      kind: 'automation',
      runId: 'run-turn-approval',
      signal: controller.signal,
      summary: 'Save automation Daily review',
      toolCallId: 'tool-explicit',
      toolName: 'lexora_buddy_automation',
    })
    await vi.waitFor(() => expect(repository.listPending('run-turn-approval')).toHaveLength(1))
    const explicitApproval = repository.listPending('run-turn-approval')[0]!
    await service.resolve({ decision: 'denied', id: explicitApproval.id })
    await expect(explicitDecision).resolves.toEqual({
      approvalId: explicitApproval.id,
      decision: 'denied',
    })
  })

  it('does not arm an expiry timer after an already durable request is aborted', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-abort',
      conversationId: 'conversation-abort',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-abort',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-abort',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-abort',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-abort',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const requestProjected = deferred<void>()
    const releaseRequest = deferred<void>()
    const resolutionProjected = deferred<void>()
    const append = async (input: AppendBuddyRunEventInput) => {
      const event = await eventLog.append(input)
      if (input.type === 'approval.requested') {
        requestProjected.resolve()
        await releaseRequest.promise
      }
      if (input.type === 'approval.resolved')
        resolutionProjected.resolve()
      return event
    }
    const service = new ApprovalService({
      approvalTimeoutMs: 5,
      eventLog: { append },
      repository,
    })
    const controller = new AbortController()
    vi.useFakeTimers()

    const decision = service.request({
      allowForTurn: true,
      arguments: { command: 'pnpm test' },
      kind: 'shell',
      runId: 'run-abort',
      signal: controller.signal,
      summary: 'Run tests',
      toolCallId: 'tool-abort',
      toolName: 'bash',
    })
    void decision.catch(() => {})
    await requestProjected.promise

    controller.abort()
    await resolutionProjected.promise
    releaseRequest.resolve()

    await expect(decision).rejects.toBeInstanceOf(ApprovalCancelledError)
    expect(repository.listPending('run-abort')).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps an approval pending when its durable resolution event cannot be appended', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-1',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-1',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-1',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const requested = deferred<void>()
    const append = vi.fn(async (input: AppendBuddyRunEventInput) => {
      if (input.type === 'approval.resolved')
        throw new Error('event storage unavailable')
      const event = await eventLog.append(input)
      requested.resolve()
      return event
    })
    const service = new ApprovalService({ eventLog: { append }, repository })
    const decision = service.request({
      allowForTurn: true,
      arguments: { command: 'pnpm test' },
      kind: 'shell',
      runId: 'run-1',
      signal: new AbortController().signal,
      summary: 'Run tests',
      toolCallId: 'tool-1',
      toolName: 'bash',
    })
    void decision.catch(() => {})
    await requested.promise
    const approval = repository.listPending()[0]!

    await expect(service.resolve({ decision: 'approved', id: approval.id }))
      .rejects
      .toThrow('event storage unavailable')
    expect(repository.findById(approval.id)).toMatchObject({
      resolvedAt: null,
      status: 'pending',
    })
  })

  it('cancels an aborted request after a concurrent resolution append fails', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-1',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-1',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-1',
    })
    const repository = createApprovalRepository(database)
    const eventLog = await createEventLog(database)
    const approvedStarted = deferred<void>()
    const requested = deferred<void>()
    const resolution = deferred<unknown>()
    const append = vi.fn(async (input: AppendBuddyRunEventInput) => {
      const payload = input.payload as { id: string, resolvedAt: string, status: 'approved' | 'cancelled' }
      if (input.type === 'approval.resolved' && payload.status === 'approved') {
        approvedStarted.resolve()
        return resolution.promise
      }
      const event = await eventLog.append(input)
      if (input.type === 'approval.requested')
        requested.resolve()
      return event
    })
    const service = new ApprovalService({ eventLog: { append }, repository })
    const controller = new AbortController()
    const decision = service.request({
      allowForTurn: true,
      arguments: { command: 'pnpm test' },
      kind: 'shell',
      runId: 'run-1',
      signal: controller.signal,
      summary: 'Run tests',
      toolCallId: 'tool-1',
      toolName: 'bash',
    })
    void decision.catch(() => {})
    await requested.promise
    const approval = repository.listPending()[0]!
    const resolving = service.resolve({ decision: 'approved', id: approval.id })
    await approvedStarted.promise

    controller.abort()
    resolution.reject(new Error('event projection failed'))

    await expect(resolving).rejects.toThrow('event projection failed')
    await expect(decision).rejects.toBeInstanceOf(ApprovalCancelledError)
    expect(append).toHaveBeenCalledTimes(3)
    expect(repository.findById(approval.id)?.status).toBe('cancelled')
  })
})

async function createEventLog(
  database: DatabaseSync,
): Promise<ReturnType<typeof createRunEventLog>> {
  const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-approval-service-'))
  directories.push(root)
  return createRunEventLog({ conversationsDirectory: join(root, 'conversations'), database })
}
