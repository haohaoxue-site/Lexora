import { describe, expect, it } from 'vitest'

import {
  automationExecutionSnapshotSchema,
  automationMutationRequestSchemas,
  automationSchema,
  automationTimingSchema,
} from '..'

const dailyTiming = {
  activeFrom: null,
  activeUntil: null,
  schedule: {
    cadence: 'daily',
    kind: 'calendar',
    localTime: '09:30',
  },
  timezone: 'Asia/Shanghai',
} as const

describe('automation shared contract', () => {
  it('enforces timezone, wall-clock, UTC instant and inclusive local-date boundaries', () => {
    expect(automationTimingSchema.parse({
      activeFrom: '2026-08-24',
      activeUntil: '2026-09-24',
      schedule: {
        anchorAt: '2026-08-24T01:30:00.000Z',
        every: 2,
        kind: 'interval',
        unit: 'day',
      },
      timezone: 'America/New_York',
    })).toMatchObject({ timezone: 'America/New_York' })

    expect(() => automationTimingSchema.parse({
      ...dailyTiming,
      timezone: 'Mars/Olympus_Mons',
    })).toThrow()
    expect(() => automationTimingSchema.parse({
      ...dailyTiming,
      schedule: { ...dailyTiming.schedule, localTime: '9:30' },
    })).toThrow()
    expect(() => automationTimingSchema.parse({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        anchorAt: '2026-08-24T09:30:00+08:00',
        every: 1,
        kind: 'interval',
        unit: 'hour',
      },
      timezone: 'Asia/Shanghai',
    })).toThrow()
    expect(() => automationTimingSchema.parse({
      ...dailyTiming,
      activeFrom: '2026-09-01',
      activeUntil: '2026-08-31',
    })).toThrow()
    expect(() => automationTimingSchema.parse({
      activeFrom: '2026-08-24',
      activeUntil: null,
      schedule: { kind: 'once', runAt: '2026-08-25T00:00:00.000Z' },
      timezone: 'Asia/Shanghai',
    })).toThrow()
  })

  it('freezes only bounded execution data in a claim snapshot', () => {
    const snapshot = automationExecutionSnapshotSchema.parse({
      executionProfile: 'workspace_write',
      model: { mode: 'default' },
      name: 'Daily brief',
      spaceId: null,
      spaceContext: null,
      prompt: 'Prepare the brief',
      timing: dailyTiming,
    })

    expect(snapshot).toMatchObject({ executionProfile: 'workspace_write' })
    expect(() => automationExecutionSnapshotSchema.parse({
      ...snapshot,
      credential: 'secret',
    })).toThrow()
    expect(() => automationExecutionSnapshotSchema.parse({
      ...snapshot,
      prompt: 'a'.repeat(32 * 1024 + 1),
    })).toThrow()
  })

  it('requires request identity and optimistic revisions for every mutation', () => {
    expect(automationMutationRequestSchemas.create.parse({
      draft: {
        model: { mode: 'default' },
        name: 'Daily brief',
        spaceId: null,
        prompt: 'Prepare the brief',
        timing: dailyTiming,
      },
      requestId: 'request-1',
    })).toMatchObject({ requestId: 'request-1' })
    for (const operation of ['pause', 'resume', 'delete', 'runNow'] as const) {
      expect(automationMutationRequestSchemas[operation].parse({
        automationId: 'automation-1',
        expectedRevision: 2,
        requestId: `request-${operation}`,
      })).toMatchObject({ expectedRevision: 2 })
    }
    expect(() => automationMutationRequestSchemas.pause.parse({
      automationId: 'automation-1',
      requestId: 'request-pause',
    })).toThrow()
  })

  it('reserves blocked lifecycle reasons for persistent Space or pinned-model failures', () => {
    const automation = {
      blockedReason: 'AUTOMATION_SPACE_UNAVAILABLE',
      createdAt: '2026-08-24T01:00:00.000Z',
      executionProfile: 'workspace_write',
      id: 'automation-1',
      lastRunAt: null,
      model: { mode: 'default' },
      name: 'Daily brief',
      nextRunAt: null,
      spaceId: 'space-1',
      prompt: 'Prepare the brief',
      revision: 1,
      status: 'blocked',
      timing: dailyTiming,
      updatedAt: '2026-08-24T01:00:00.000Z',
    }

    expect(automationSchema.parse(automation)).toEqual(automation)
    expect(() => automationSchema.parse({
      ...automation,
      blockedReason: 'AUTOMATION_RUN_TIMEOUT',
    })).toThrow()
    expect(() => automationSchema.parse({
      ...automation,
      status: 'active',
    })).toThrow()
    expect(automationSchema.parse({
      ...automation,
      blockedReason: null,
      nextRunAt: '2026-08-25T01:30:00.000Z',
      status: 'active',
    })).toMatchObject({ status: 'active' })
    expect(() => automationSchema.parse({
      ...automation,
      blockedReason: null,
      nextRunAt: null,
      status: 'active',
    })).toThrow()
    expect(() => automationSchema.parse({
      ...automation,
      blockedReason: null,
      nextRunAt: '2026-08-25T01:30:00.000Z',
      status: 'paused',
    })).toThrow()
  })
})
