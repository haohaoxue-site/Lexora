import type { AutomationTiming } from '@buddy-shared/automation'
import type { LocalAutomationPreviewResult } from '@buddy-shared/automation/automationApi'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useAutomationSchedulePreview } from '../useAutomationSchedulePreview'

const validPreview: LocalAutomationPreviewResult = {
  frequency: { cadence: 'daily', kind: 'calendar', localTime: '09:00', timezone: 'Asia/Shanghai' },
  normalizedTiming: schedule('09:00'),
  nextRunAt: '2026-09-09T01:00:00.000Z',
  samples: ['2026-09-09T01:00:00.000Z'],
  valid: true,
}

function schedule(localTime: string): AutomationTiming {
  return {
    activeFrom: null,
    activeUntil: null,
    schedule: { cadence: 'daily', kind: 'calendar', localTime },
    timezone: 'Asia/Shanghai',
  }
}

describe('automation schedule preview', () => {
  afterEach(() => vi.useRealTimers())

  it('invalidates an accepted preview immediately and ignores older responses during debounce', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const timing = shallowRef<AutomationTiming | null>(schedule('09:00'))
    const previous = deferred<LocalAutomationPreviewResult>()
    const latest = deferred<LocalAutomationPreviewResult>()
    const preview = vi.fn().mockResolvedValueOnce(validPreview).mockReturnValueOnce(previous.promise).mockReturnValueOnce(latest.promise)
    const state = scope.run(() => useAutomationSchedulePreview(timing, preview))!
    try {
      await vi.advanceTimersByTimeAsync(180)
      expect(state.value).toEqual({ result: validPreview, status: 'ready' })

      timing.value = schedule('10:00')
      expect(state.value).toEqual({ status: 'loading' })
      await vi.advanceTimersByTimeAsync(180)
      timing.value = schedule('11:00')
      previous.resolve(validPreview)
      await Promise.resolve()
      expect(state.value).toEqual({ status: 'loading' })

      await vi.advanceTimersByTimeAsync(180)
      const invalid: LocalAutomationPreviewResult = { issues: [{ code: 'AUTOMATION_INVALID_SCHEDULE', path: ['timing'] }], valid: false }
      latest.resolve(invalid)
      await Promise.resolve()
      expect(state.value).toEqual({ result: invalid, status: 'ready' })
    }
    finally {
      scope.stop()
    }
  })

  it('does not restore an old error or success after the schedule becomes invalid', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const timing = shallowRef<AutomationTiming | null>(schedule('09:00'))
    const pending = deferred<LocalAutomationPreviewResult>()
    const state = scope.run(() => useAutomationSchedulePreview(timing, () => pending.promise))!
    try {
      await vi.advanceTimersByTimeAsync(180)
      timing.value = null
      pending.reject(new Error('Outdated request'))
      await Promise.resolve()
      expect(state.value).toEqual({ status: 'idle' })
    }
    finally {
      scope.stop()
    }
  })

  it('leaves disposed editor state untouched by pending requests', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const pending = deferred<LocalAutomationPreviewResult>()
    const state = scope.run(() => useAutomationSchedulePreview(schedule('09:00'), () => pending.promise))!
    await vi.advanceTimersByTimeAsync(180)
    scope.stop()
    const beforeDispose = state.value
    pending.resolve(validPreview)
    await Promise.resolve()
    expect(state.value).toBe(beforeDispose)
  })
})
