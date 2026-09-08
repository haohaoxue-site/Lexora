import type { AutomationTiming } from '@buddy-shared/automation'
import type { MaybeRefOrGetter } from 'vue'
import type { AutomationPreview, AutomationPreviewState } from './typing'
import { readonly, shallowRef, toValue, watch } from 'vue'

export function useAutomationSchedulePreview(
  timing: MaybeRefOrGetter<AutomationTiming | null>,
  preview: AutomationPreview,
) {
  const state = shallowRef<AutomationPreviewState>({ status: 'idle' })

  watch(() => JSON.stringify(toValue(timing)), (_key, _previous, onCleanup) => {
    const value = toValue(timing)
    if (!value) {
      state.value = { status: 'idle' }
      return
    }

    let cancelled = false
    state.value = { status: 'loading' }
    const timer = setTimeout(async () => {
      try {
        const result = await preview({ sampleCount: 3, timing: value })
        if (!cancelled)
          state.value = { result, status: 'ready' }
      }
      catch {
        if (!cancelled)
          state.value = { status: 'failed' }
      }
    }, 180)

    onCleanup(() => {
      cancelled = true
      clearTimeout(timer)
    })
  }, { flush: 'sync', immediate: true })

  return readonly(state)
}
