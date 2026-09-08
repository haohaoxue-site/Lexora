import type { AutomationTiming } from '../../../../shared/automation'
import { describe, expect, it } from 'vitest'

import {
  previewAutomationSchedule,
} from '../AutomationScheduleEvaluator'

describe('automationScheduleEvaluator', () => {
  it('skips missing month days, preserves last-day intent and skips non-leap years', () => {
    expect(preview({
      ...dailyTiming('09:00'),
      schedule: {
        cadence: 'monthly',
        dayOfMonth: 31,
        kind: 'calendar',
        localTime: '09:00',
      },
    }, '2026-04-01T00:00:00.000Z')).toMatchObject({
      nextRunAt: '2026-05-31T01:00:00.000Z',
    })
    expect(preview({
      ...dailyTiming('09:00'),
      schedule: {
        cadence: 'monthly',
        dayOfMonth: 'last',
        kind: 'calendar',
        localTime: '09:00',
      },
    }, '2026-04-01T00:00:00.000Z')).toMatchObject({
      nextRunAt: '2026-04-30T01:00:00.000Z',
    })
    expect(preview({
      ...dailyTiming('09:00'),
      schedule: {
        cadence: 'yearly',
        day: 29,
        kind: 'calendar',
        localTime: '09:00',
        month: 2,
      },
    }, '2026-01-01T00:00:00.000Z')).toMatchObject({
      nextRunAt: '2028-02-29T01:00:00.000Z',
    })
  })

  it('uses Temporal compatible disambiguation for DST gaps and the earlier fold offset once', () => {
    const gapTiming: AutomationTiming = {
      activeFrom: '2026-03-08',
      activeUntil: '2026-03-08',
      schedule: {
        cadence: 'daily',
        kind: 'calendar',
        localTime: '02:30',
      },
      timezone: 'America/New_York',
    }
    expect(preview(gapTiming, '2026-03-08T06:00:00.000Z')).toMatchObject({
      nextRunAt: '2026-03-08T07:30:00.000Z',
    })

    const foldTiming: AutomationTiming = {
      activeFrom: '2026-11-01',
      activeUntil: '2026-11-01',
      schedule: {
        cadence: 'daily',
        kind: 'calendar',
        localTime: '01:30',
      },
      timezone: 'America/New_York',
    }
    expect(preview(foldTiming, '2026-11-01T04:00:00.000Z')).toMatchObject({
      nextRunAt: '2026-11-01T05:30:00.000Z',
    })
    expect(preview(foldTiming, '2026-11-01T05:31:00.000Z')).toMatchObject({
      nextRunAt: null,
      samples: [],
      valid: true,
    })
  })

  it('separates fixed elapsed hours from local calendar-day intervals across DST', () => {
    const hourly = preview({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        anchorAt: '2026-03-07T07:30:00.000Z',
        every: 24,
        kind: 'interval',
        unit: 'hour',
      },
      timezone: 'America/New_York',
    }, '2026-03-08T07:31:00.000Z')
    expect(hourly).toMatchObject({ nextRunAt: '2026-03-09T07:30:00.000Z' })

    const daily = preview({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        anchorAt: '2026-03-07T07:30:00.000Z',
        every: 1,
        kind: 'interval',
        unit: 'day',
      },
      timezone: 'America/New_York',
    }, '2026-03-08T07:31:00.000Z')
    expect(daily).toMatchObject({ nextRunAt: '2026-03-09T06:30:00.000Z' })
  })

  it('evaluates tenth-hour interval multiples without floating-point drift', () => {
    const result = preview({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        anchorAt: '2026-08-24T01:00:00.000Z',
        every: 1.1,
        kind: 'interval',
        unit: 'hour',
      },
      timezone: 'Asia/Shanghai',
    }, '2026-08-24T02:31:00.000Z')

    expect(result).toMatchObject({
      nextRunAt: '2026-08-24T03:12:00.000Z',
      samples: [
        '2026-08-24T03:12:00.000Z',
        '2026-08-24T04:18:00.000Z',
        '2026-08-24T05:24:00.000Z',
      ],
    })
  })

  it('treats an empty active range as invalid but an elapsed non-empty range as completed', () => {
    expect(preview({
      activeFrom: '2026-04-01',
      activeUntil: '2026-04-30',
      schedule: {
        cadence: 'monthly',
        dayOfMonth: 31,
        kind: 'calendar',
        localTime: '09:00',
      },
      timezone: 'Asia/Shanghai',
    }, '2026-03-01T00:00:00.000Z')).toEqual({
      issues: [{ code: 'AUTOMATION_INVALID_SCHEDULE', path: ['schedule'] }],
      valid: false,
    })

    expect(preview({
      activeFrom: '2026-08-01',
      activeUntil: '2026-08-02',
      schedule: {
        cadence: 'daily',
        kind: 'calendar',
        localTime: '09:00',
      },
      timezone: 'Asia/Shanghai',
    }, '2026-08-24T00:00:00.000Z')).toMatchObject({
      nextRunAt: null,
      samples: [],
      valid: true,
    })
  })

  it('returns a future once occurrence only once and rejects a past rule', () => {
    expect(preview({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        kind: 'once',
        runAt: '2026-08-24T01:01:00.000Z',
      },
      timezone: 'Asia/Shanghai',
    }, '2026-08-24T01:00:00.000Z')).toMatchObject({
      nextRunAt: '2026-08-24T01:01:00.000Z',
      samples: ['2026-08-24T01:01:00.000Z'],
      valid: true,
    })

    expect(preview({
      activeFrom: null,
      activeUntil: null,
      schedule: {
        kind: 'once',
        runAt: '2026-08-23T00:00:00.000Z',
      },
      timezone: 'Asia/Shanghai',
    }, '2026-08-24T00:00:00.000Z')).toEqual({
      issues: [{ code: 'AUTOMATION_INVALID_SCHEDULE', path: ['schedule', 'runAt'] }],
      valid: false,
    })
  })

  it('has no hidden wall-clock cache when the injected system clock moves backward or forward', () => {
    let now = Temporal.Instant.from('2026-08-24T02:00:00.000Z')
    const clock = { now: () => now }

    expect(previewAutomationSchedule({ timing: dailyTiming('09:30') }, clock))
      .toMatchObject({ nextRunAt: '2026-08-25T01:30:00.000Z' })
    now = Temporal.Instant.from('2026-08-23T02:00:00.000Z')
    expect(previewAutomationSchedule({ timing: dailyTiming('09:30') }, clock))
      .toMatchObject({ nextRunAt: '2026-08-24T01:30:00.000Z' })
    now = Temporal.Instant.from('2026-08-26T02:00:00.000Z')
    expect(previewAutomationSchedule({ timing: dailyTiming('09:30') }, clock))
      .toMatchObject({ nextRunAt: '2026-08-27T01:30:00.000Z' })
  })
})

function dailyTiming(localTime: string): AutomationTiming {
  return {
    activeFrom: null,
    activeUntil: null,
    schedule: {
      cadence: 'daily',
      kind: 'calendar',
      localTime,
    },
    timezone: 'Asia/Shanghai',
  }
}

function preview(timing: unknown, now: string) {
  return previewAutomationSchedule(
    { sampleCount: 3, timing },
    { now: () => Temporal.Instant.from(now) },
  )
}
