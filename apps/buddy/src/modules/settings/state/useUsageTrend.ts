import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { LocalUsageTrend, UsagePeriod } from '@buddy-shared/usage/usageAnalyticsApi'
import type { Ref } from 'vue'
import type { UsageTrendView } from '../model/usageTrend'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef, watch } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'
import { usageTrendRequest } from '../model/usageTrend'

interface UsageTrendOptions {
  api: Pick<LocalChatApi['usage'], 'trend'>
  language: Readonly<Ref<BuddyLocale>>
  runtime: Readonly<Ref<{ status: string }>>
  ready: Promise<void>
  annual: Readonly<Ref<UsagePeriod>>
  revision: Readonly<Ref<number>>
}

export function useUsageTrend(options: UsageTrendOptions) {
  const view = shallowRef<UsageTrendView>('year')
  const selectedDate = shallowRef<string | null>(null)
  const date = computed(() => selectedDate.value ?? options.annual.value.endDate)
  const request = computed(() => usageTrendRequest(view.value, date.value, options.annual.value))
  const buckets = shallowRef<LocalUsageTrend>([])
  const loading = shallowRef(true)
  const error = shallowRef<string | null>(null)
  const retryRevision = shallowRef(0)

  watch([
    () => options.annual.value.startDate,
    () => options.annual.value.endDate,
    () => options.annual.value.timeZone,
  ], () => selectedDate.value = null, { flush: 'sync' })

  watch([request, options.revision, retryRevision, () => options.runtime.value.status], async ([input, , , status], _, onCleanup) => {
    let active = true
    onCleanup(() => active = false)
    loading.value = true
    error.value = null
    buckets.value = []
    if (status !== 'ready')
      return
    try {
      await options.ready
      if (!active)
        return
      const result = await options.api.trend(input)
      if (active)
        buckets.value = result
    }
    catch (cause) {
      if (active)
        error.value = resolveLocalChatErrorMessage(cause, options.language.value)
    }
    finally {
      if (active)
        loading.value = false
    }
  }, { immediate: true })

  return {
    view: readonly(view),
    date,
    request,
    annual: options.annual,
    buckets: readonly(buckets),
    loading: readonly(loading),
    error: readonly(error),
    setView: (value: UsageTrendView) => view.value = value,
    setDate: (value: string | null) => selectedDate.value = value,
    retry: () => retryRevision.value += 1,
  }
}

export type UsageTrendState = ReturnType<typeof useUsageTrend>
