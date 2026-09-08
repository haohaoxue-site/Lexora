import type { DatabaseSync } from 'node:sqlite'
import type { AutomationDefinitionDraft } from '../../../../shared/automation'
import { afterEach, describe, expect, it } from 'vitest'

import { createAutomationRepositories } from '../../storage/automationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { createSpaceRepository } from '../../storage/spaceRepository'
import { AutomationChangeCoordinator } from '../AutomationChangeCoordinator'
import { AutomationService } from '../AutomationService'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('automationChangeCoordinator', () => {
  it('reconciles unavailable dependencies and publishes one scheduler wake', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const service = new AutomationService({
      clock: { now: () => Temporal.Instant.from('2026-08-24T00:00:00.000Z') },
      createId: incrementalIds('automation'),
      repositories: createAutomationRepositories(database),
    })
    const spaces = createSpaceRepository(database)
    spaces.create(spaceRecord('space-missing'))
    spaces.create(spaceRecord('space-ok'))
    const missingSpace = service.create({
      draft: dailyDraft({ name: 'Missing Space', spaceId: 'space-missing' }),
      requestId: 'create-space',
    })
    const missingModel = service.create({
      draft: dailyDraft({
        model: {
          mode: 'pinned',
          modelId: 'model-missing',
          providerId: 'provider-missing',
          reasoning: null,
        },
        name: 'Missing model',
      }),
      requestId: 'create-model',
    })
    const available = service.create({
      draft: dailyDraft({
        model: {
          mode: 'pinned',
          modelId: 'model-ok',
          providerId: 'provider-ok',
          reasoning: null,
        },
        name: 'Available',
        spaceId: 'space-ok',
      }),
      requestId: 'create-available',
    })
    const notifications: string[] = []
    let wakeCount = 0
    const coordinator = new AutomationChangeCoordinator({
      notify: automationId => notifications.push(automationId),
      service,
      wakeScheduler: () => {
        wakeCount += 1
      },
    })

    const blocked = coordinator.reconcileDependencies({
      isPinnedModelAvailable: (providerId, modelId) => (
        providerId === 'provider-ok' && modelId === 'model-ok'
      ),
      isSpaceAvailable: spaceId => spaceId === 'space-ok',
    })

    expect(blocked.map(item => item.id).sort()).toEqual([
      missingModel.id,
      missingSpace.id,
    ].sort())
    expect(notifications.sort()).toEqual(blocked.map(item => item.id).sort())
    expect(wakeCount).toBe(1)
    expect(service.get(missingSpace.id)).toMatchObject({
      blockedReason: 'AUTOMATION_SPACE_UNAVAILABLE',
      status: 'blocked',
    })
    expect(service.get(missingModel.id)).toMatchObject({
      blockedReason: 'AUTOMATION_PINNED_MODEL_UNAVAILABLE',
      status: 'blocked',
    })
    expect(service.get(available.id)).toMatchObject({ status: 'active' })

    expect(coordinator.reconcileDependencies({
      isPinnedModelAvailable: () => true,
      isSpaceAvailable: () => true,
    })).toEqual([])
    expect(wakeCount).toBe(1)
  })
})

function dailyDraft(
  overrides: Partial<AutomationDefinitionDraft> = {},
): AutomationDefinitionDraft {
  return {
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
    ...overrides,
  }
}

function incrementalIds(prefix: string): () => string {
  let next = 0
  return () => `${prefix}-${++next}`
}

function spaceRecord(id: string) {
  const createdAt = '2026-08-24T00:00:00.000Z'
  const root = `/spaces/${id}`
  return {
    additionalDirectories: [],
    createdAt,
    id,
    memoryScope: 'personal_and_space' as const,
    name: id,
    primaryDirectory: {
      accessGrantedAt: createdAt,
      canonicalRoot: root,
      id: `directory-${id}`,
      resourcesTrustedAt: createdAt,
      root,
    },
  }
}
