import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAutomationRepositories } from '../../storage/automationRepository'
import { createAutomationTurnRepository } from '../../storage/automationTurnRepository'
import { openBuddyDatabase } from '../../storage/database'
import { AutomationOccurrenceLifecycleService } from '../AutomationOccurrenceLifecycleService'
import { AutomationService } from '../AutomationService'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('automationOccurrenceLifecycleService', () => {
  it('deletes a bound occurrence, its conversation, and its notification as one lifecycle', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const automations = new AutomationService({
      clock: { now: () => Temporal.Instant.from('2026-08-24T00:00:00.000Z') },
      createId: incrementalIds('automation'),
      repositories: createAutomationRepositories(database),
    })
    const automation = automations.create({
      draft: {
        executionProfile: 'workspace_write',
        model: { mode: 'default' },
        name: 'Automation',
        spaceId: null,
        prompt: 'Run automation',
        timing: {
          activeFrom: null,
          activeUntil: null,
          schedule: { cadence: 'daily', kind: 'calendar', localTime: '12:00' },
          timezone: 'Asia/Shanghai',
        },
      },
      requestId: 'create-1',
    })
    automations.runNow({
      automationId: automation.id,
      expectedRevision: automation.revision,
      requestId: 'run-1',
    })
    const occurrence = automations.leaseQueued({
      leaseExpiresAt: '2026-08-24T00:01:00.000Z',
      limit: 1,
      now: '2026-08-24T00:00:00.000Z',
      owner: 'scheduler-1',
    })[0]!
    const bound = createAutomationTurnRepository(database).bind({
      boundAt: '2026-08-24T00:00:10.000Z',
      branchId: 'branch-1',
      contextWindow: 200_000,
      executionContext: null,
      conversationId: 'conversation-1',
      leaseOwner: 'scheduler-1',
      maxTokens: 32_000,
      messageId: 'message-1',
      model: 'model-1',
      occurrenceId: occurrence.id,
      spaceId: null,
      provider: 'provider-1',
      reasoning: null,
      runId: 'run-1',
    })
    expect(bound.kind).toBe('bound')
    const deleteConversation = vi.fn(async () => true)
    const removeAutomationRun = vi.fn()
    const lifecycle = new AutomationOccurrenceLifecycleService({
      automations,
      conversationLifecycle: { delete: deleteConversation },
      notifications: { removeAutomationRun },
    })

    await expect(lifecycle.deleteOccurrence(occurrence.id)).resolves.toEqual({
      automationId: automation.id,
      deleted: true,
    })
    expect(deleteConversation).toHaveBeenCalledWith('conversation-1')
    expect(removeAutomationRun).toHaveBeenCalledWith('run-1')
    expect(automations.listHistory({ limit: 20 }).items).toEqual([])
  })

  it('hides the same occurrence when deletion starts from chat history', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const automations = new AutomationService({
      clock: { now: () => Temporal.Instant.from('2026-08-24T00:00:00.000Z') },
      createId: incrementalIds('automation'),
      repositories: createAutomationRepositories(database),
    })
    const automation = automations.create({
      draft: {
        executionProfile: 'workspace_write',
        model: { mode: 'default' },
        name: 'Automation',
        spaceId: null,
        prompt: 'Run automation',
        timing: {
          activeFrom: null,
          activeUntil: null,
          schedule: { cadence: 'daily', kind: 'calendar', localTime: '12:00' },
          timezone: 'Asia/Shanghai',
        },
      },
      requestId: 'create-2',
    })
    automations.runNow({
      automationId: automation.id,
      expectedRevision: automation.revision,
      requestId: 'run-2',
    })
    const occurrence = automations.leaseQueued({
      leaseExpiresAt: '2026-08-24T00:01:00.000Z',
      limit: 1,
      now: '2026-08-24T00:00:00.000Z',
      owner: 'scheduler-1',
    })[0]!
    createAutomationTurnRepository(database).bind({
      boundAt: '2026-08-24T00:00:10.000Z',
      branchId: 'branch-2',
      contextWindow: 200_000,
      executionContext: null,
      conversationId: 'conversation-2',
      leaseOwner: 'scheduler-1',
      maxTokens: 32_000,
      messageId: 'message-2',
      model: 'model-1',
      occurrenceId: occurrence.id,
      spaceId: null,
      provider: 'provider-1',
      reasoning: null,
      runId: 'run-2',
    })
    const lifecycle = new AutomationOccurrenceLifecycleService({
      automations,
      conversationLifecycle: { delete: vi.fn(async () => true) },
      notifications: { removeAutomationRun: vi.fn() },
    })

    await expect(lifecycle.deleteConversation('conversation-2')).resolves.toEqual({
      automationId: automation.id,
      deleted: true,
    })
    expect(automations.listHistory({ limit: 20 }).items).toEqual([])
  })
})

function incrementalIds(prefix: string): () => string {
  let next = 0
  return () => `${prefix}-${++next}`
}
