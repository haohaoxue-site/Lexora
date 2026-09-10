import type { ChatActivitySummary } from '../../../model/transcript/chatActivitySummary'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useChatActivitySummary } from '../useChatActivitySummary'

describe('activity summary cadence', () => {
  it('shows new work immediately when a completed group resumes', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const source = shallowRef({ ...summary('done'), active: false, immediate: true })
      const displayed = scope.run(() => useChatActivitySummary(() => source.value))!
      source.value = summary('next-tool')
      await nextTick()
      expect(displayed.value).toMatchObject({ key: 'next-tool', active: true })
    }
    finally {
      scope.stop()
      vi.useRealTimers()
    }
  })

  it('keeps short live actions readable, presents completion immediately and cancels stale updates', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    try {
      const source = shallowRef(summary('one'))
      const displayed = scope.run(() => useChatActivitySummary(() => source.value))!
      source.value = summary('two')
      await nextTick()
      await vi.advanceTimersByTimeAsync(300)
      expect(displayed.value.key).toBe('one')
      source.value = summary('three')
      await nextTick()
      await vi.advanceTimersByTimeAsync(300)
      expect(displayed.value.key).toBe('three')
      source.value = summary('four')
      await nextTick()
      source.value = { ...summary('done'), active: false, immediate: true }
      await nextTick()
      expect(displayed.value.key).toBe('done')
      await vi.advanceTimersByTimeAsync(1000)
      expect(displayed.value.key).toBe('done')
      source.value = summary('five')
      await nextTick()
      source.value = summary('six')
      await nextTick()
      scope.stop()
      await vi.advanceTimersByTimeAsync(1000)
      expect(displayed.value.key).toBe('five')
    }
    finally {
      scope.stop()
      vi.useRealTimers()
    }
  })
})

function summary(key: string): ChatActivitySummary {
  return { key, label: key, target: '', icon: 'file', active: true, immediate: false }
}
