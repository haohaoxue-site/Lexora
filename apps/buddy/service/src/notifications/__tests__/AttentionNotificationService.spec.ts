import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openBuddyDatabase } from '../../storage/database'
import { createNotificationAttentionRepository } from '../../storage/notificationAttentionRepository'
import { createProviderRepository } from '../../storage/providerRepository'
import { AttentionNotificationService } from '../AttentionNotificationService'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('attentionNotificationService', () => {
  it('counts only unseen revisions and never resolves work when marking notifications seen', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const providers = createProviderRepository(database)
    const now = { value: '2026-08-20T00:00:00.000Z' }
    providers.models.upsert(modelState())
    const service = new AttentionNotificationService({
      attention: createNotificationAttentionRepository(database),
      listAutomationRuns: () => [],
      listModels: () => providers.models.list(),
      now: () => now.value,
    })

    const initial = service.list()
    expect(initial).toMatchObject({ unseenCount: 1 })
    expect(initial.items).toEqual([
      expect.objectContaining({
        attention: 'unseen',
        kind: 'model.source-parameters-updated',
        lifecycle: 'active',
        payload: { modelCount: 1 },
      }),
    ])

    service.markAllSeen()
    expect(service.list()).toMatchObject({ unseenCount: 0 })
    expect(providers.models.find('anthropic', 'claude')).toMatchObject({
      acknowledgedSourceRevision: 'source-v1',
      overrideContextWindow: 200_000,
      sourceRevision: 'source-v2',
    })

    providers.models.upsert({
      ...providers.models.find('anthropic', 'claude')!,
      sourceContextWindow: 300_000,
      sourceRevision: 'source-v3',
      updatedAt: '2026-08-20T00:01:00.000Z',
    })
    expect(service.list()).toMatchObject({ unseenCount: 1 })
  })

  it('includes terminal automation runs without adding ordinary conversation activity', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const now = '2026-08-20T00:00:00.000Z'
    const attention = createNotificationAttentionRepository(database)
    attention.observe({
      kind: 'approval.requested',
      notificationId: 'local:approval:approval-1',
      observedAt: now,
      occurredAt: now,
      origin: 'local-runtime',
      payload: {
        approvalId: 'approval-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        summary: 'Run a shell command',
      },
      resolvedAt: null,
      revision: now,
    })
    attention.observe({
      kind: 'run.completed',
      notificationId: 'local:run:run-1',
      observedAt: now,
      occurredAt: now,
      origin: 'local-runtime',
      payload: { conversationId: 'conversation-1', errorCode: null, runId: 'run-1' },
      resolvedAt: now,
      revision: now,
    })
    const service = new AttentionNotificationService({
      attention,
      listAutomationRuns: () => [
        {
          automationId: 'automation-1',
          automationName: '每日整理文档',
          completedAt: '2026-08-20T00:02:00.000Z',
          conversationId: 'conversation-automation-1',
          errorCode: null,
          runId: 'run-automation-1',
          status: 'completed',
        },
        {
          automationId: 'automation-2',
          automationName: '检查构建结果',
          completedAt: '2026-08-20T00:01:00.000Z',
          conversationId: 'conversation-automation-2',
          errorCode: 'AUTOMATION_RUN_TIMEOUT',
          runId: 'run-automation-2',
          status: 'failed',
        },
      ],
      listModels: () => [],
      now: () => '2026-08-20T00:03:00.000Z',
    })

    expect(service.list()).toEqual({
      items: [
        {
          action: {
            conversationId: 'conversation-automation-1',
            runId: 'run-automation-1',
            type: 'open-conversation',
          },
          attention: 'unseen',
          audience: 'device',
          id: 'local:automation-run:run-automation-1',
          kind: 'automation.run.completed',
          lifecycle: 'resolved',
          occurredAt: '2026-08-20T00:02:00.000Z',
          origin: 'local-runtime',
          payload: {
            automationId: 'automation-1',
            automationName: '每日整理文档',
            errorCode: null,
          },
          resolvedAt: '2026-08-20T00:02:00.000Z',
          revision: '2026-08-20T00:02:00.000Z',
        },
        {
          action: {
            conversationId: 'conversation-automation-2',
            runId: 'run-automation-2',
            type: 'open-conversation',
          },
          attention: 'unseen',
          audience: 'device',
          id: 'local:automation-run:run-automation-2',
          kind: 'automation.run.failed',
          lifecycle: 'resolved',
          occurredAt: '2026-08-20T00:01:00.000Z',
          origin: 'local-runtime',
          payload: {
            automationId: 'automation-2',
            automationName: '检查构建结果',
            errorCode: 'AUTOMATION_RUN_TIMEOUT',
          },
          resolvedAt: '2026-08-20T00:01:00.000Z',
          revision: '2026-08-20T00:01:00.000Z',
        },
      ],
      unseenCount: 2,
    })
  })
})

function modelState() {
  return {
    acknowledgedSourceRevision: 'source-v1',
    api: 'anthropic-messages',
    available: true,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    createdAt: '2026-08-20T00:00:00.000Z',
    displayName: 'Claude',
    enabled: true,
    input: ['text'] as Array<'text' | 'image'>,
    lastSeenAt: '2026-08-20T00:00:00.000Z',
    modelId: 'claude',
    overrideContextWindow: 200_000,
    overrideMaxTokens: 32_000,
    providerId: 'anthropic',
    reasoning: false,
    source: 'builtin' as const,
    sourceContextWindow: 256_000,
    sourceMaxTokens: 64_000,
    sourceRevision: 'source-v2',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}
