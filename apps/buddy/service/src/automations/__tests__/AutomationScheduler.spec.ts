import type { DatabaseSync } from 'node:sqlite'
import type { AutomationOccurrenceRecord } from '../../storage/automationOccurrenceRecord'
import type { AutomationClock } from '../AutomationScheduleEvaluator'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAutomationRepositories } from '../../storage/automationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { AutomationScheduler } from '../AutomationScheduler'
import { AutomationService } from '../AutomationService'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('automationScheduler', () => {
  it('polls every 30 seconds and stops claiming after disposal', async () => {
    vi.useFakeTimers()
    try {
      const fixture = createFixture('2026-08-24T00:00:00.000Z')
      fixture.service.create({
        draft: onceDraft('2026-08-24T00:00:30.000Z'),
        requestId: 'create-polling',
      })
      const dispatch = vi.fn(async (_occurrence: AutomationOccurrenceRecord) => {})
      const scheduler = fixture.scheduler(dispatch)

      await scheduler.start()
      expect(dispatch).not.toHaveBeenCalled()

      fixture.clock.set('2026-08-24T00:00:30.000Z')
      await vi.advanceTimersByTimeAsync(29_999)
      expect(dispatch).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(dispatch).toHaveBeenCalledOnce()

      await scheduler.dispose()
      fixture.service.create({
        draft: onceDraft('2026-08-24T00:01:00.000Z'),
        requestId: 'create-after-dispose',
      })
      fixture.clock.set('2026-08-24T00:01:00.000Z')
      await vi.advanceTimersByTimeAsync(30_000)
      await scheduler.wake()
      expect(dispatch).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('coalesces recent missed candidates and wakes without waiting for the polling timer', async () => {
    const fixture = createFixture('2026-08-24T00:00:00.000Z')
    const automation = fixture.service.create({
      draft: hourlyDraft('2026-08-24T00:00:00.000Z'),
      requestId: 'create-1',
    })
    fixture.clock.set('2026-08-24T05:30:00.000Z')
    const dispatch = vi.fn((_occurrence: AutomationOccurrenceRecord) => (
      new Promise<void>(() => {})
    ))
    const scheduler = fixture.scheduler(dispatch)

    await scheduler.start()

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0]).toMatchObject({
      coalescedMissedCount: 4,
      scheduledFor: '2026-08-24T05:00:00.000Z',
    })
    expect(fixture.service.get(automation.id)?.nextRunAt).toBe('2026-08-24T06:00:00.000Z')

    fixture.clock.set('2026-08-24T06:30:00.000Z')
    await scheduler.wake()
    expect(fixture.service.listHistory({ automationId: automation.id }).items)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ scheduledFor: '2026-08-24T06:00:00.000Z' }),
      ]))
    await scheduler.dispose()
  })

  it('skips stale recurring backlog and expires a stale once occurrence', async () => {
    const fixture = createFixture('2026-08-24T00:00:00.000Z')
    const recurring = fixture.service.create({
      draft: dailyDraft(),
      requestId: 'create-recurring',
    })
    const once = fixture.service.create({
      draft: onceDraft('2026-08-24T00:10:00.000Z'),
      requestId: 'create-once',
    })
    fixture.clock.set('2026-08-26T12:00:00.000Z')
    const dispatch = vi.fn(async (_occurrence: AutomationOccurrenceRecord) => {})
    const scheduler = fixture.scheduler(dispatch)

    await scheduler.start()

    expect(dispatch).not.toHaveBeenCalled()
    expect(fixture.service.listHistory({ automationId: recurring.id }).items[0])
      .toMatchObject({ errorCode: 'MISSED_WINDOW_EXCEEDED', status: 'skipped' })
    expect(fixture.service.get(recurring.id)?.nextRunAt).toBe('2026-08-27T01:30:00.000Z')
    expect(fixture.service.listHistory({ automationId: once.id }).items[0])
      .toMatchObject({ errorCode: 'MISSED_WINDOW_EXCEEDED', status: 'expired' })
    expect(fixture.service.get(once.id)).toMatchObject({ nextRunAt: null, status: 'completed' })
    await scheduler.dispose()
  })

  it('dispatches at most two leased occurrences and fills a slot after completion', async () => {
    const fixture = createFixture('2026-08-24T00:00:00.000Z')
    for (let index = 0; index < 3; index += 1) {
      fixture.service.create({
        draft: onceDraft(`2026-08-24T00:1${index}:00.000Z`),
        requestId: `create-${index}`,
      })
    }
    fixture.clock.set('2026-08-24T00:20:00.000Z')
    const completions: Array<() => void> = []
    const dispatch = vi.fn((_occurrence: AutomationOccurrenceRecord) => new Promise<void>((resolve) => {
      completions.push(resolve)
    }))
    const scheduler = fixture.scheduler(dispatch)

    await scheduler.start()
    expect(dispatch).toHaveBeenCalledTimes(2)

    completions[0]!()
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(3))
    await scheduler.dispose()
  })
})

function createFixture(initialTime: string) {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const clock = mutableClock(initialTime)
  const service = new AutomationService({
    clock,
    createId: incrementalIds(),
    repositories: createAutomationRepositories(database),
  })
  return {
    clock,
    service,
    scheduler: (dispatch: (occurrence: AutomationOccurrenceRecord) => Promise<void>) => (
      new AutomationScheduler({
        automationService: service,
        clock,
        createOwnerId: () => 'scheduler-1',
        dispatch,
      })
    ),
  }
}

function dailyDraft() {
  return {
    executionProfile: 'workspace_write' as const,
    model: { mode: 'default' as const },
    name: 'Daily',
    spaceId: null,
    prompt: 'Run daily',
    timing: {
      activeFrom: null,
      activeUntil: null,
      schedule: { cadence: 'daily' as const, kind: 'calendar' as const, localTime: '09:30' },
      timezone: 'Asia/Shanghai',
    },
  }
}

function hourlyDraft(anchorAt: string) {
  return {
    executionProfile: 'workspace_write' as const,
    model: { mode: 'default' as const },
    name: 'Hourly',
    spaceId: null,
    prompt: 'Run hourly',
    timing: {
      activeFrom: null,
      activeUntil: null,
      schedule: { anchorAt, every: 1, kind: 'interval' as const, unit: 'hour' as const },
      timezone: 'UTC',
    },
  }
}

function onceDraft(runAt: string) {
  return {
    executionProfile: 'workspace_write' as const,
    model: { mode: 'default' as const },
    name: 'Once',
    spaceId: null,
    prompt: 'Run once',
    timing: {
      activeFrom: null,
      activeUntil: null,
      schedule: { kind: 'once' as const, runAt },
      timezone: 'UTC',
    },
  }
}

function mutableClock(initialTime: string): AutomationClock & { set: (value: string) => void } {
  let current = Temporal.Instant.from(initialTime)
  return {
    now: () => current,
    set: value => current = Temporal.Instant.from(value),
  }
}

function incrementalIds(): () => string {
  let next = 0
  return () => `id-${String(++next).padStart(4, '0')}`
}
