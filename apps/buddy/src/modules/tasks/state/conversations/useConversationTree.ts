import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { LocalConversationTree } from '@buddy-shared/conversation/conversationTree'
import type { LocalRun } from '@buddy-shared/runs/runApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { onScopeDispose, readonly, shallowRef, watch } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

export function useConversationTree(options: {
  api: Pick<LocalChatApi['conversations'], 'getTree'>
  conversationId: Readonly<Ref<string | null>>
  branchId: Readonly<Ref<string | null>>
  language: Readonly<Ref<BuddyLocale>>
  runs: Readonly<Ref<readonly LocalRun[]>>
}) {
  const data = shallowRef<LocalConversationTree | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const visible = shallowRef(false)
  let generation = 0
  let disposed = false

  async function refresh() {
    const conversationId = options.conversationId.value
    if (!visible.value || !conversationId || disposed)
      return
    const current = ++generation
    loading.value = !data.value
    try {
      const result = await options.api.getTree(conversationId)
      if (current !== generation || disposed)
        return
      data.value = result
      error.value = null
    }
    catch (cause) {
      if (current === generation)
        error.value = resolveLocalChatErrorMessage(cause, options.language.value)
    }
    finally {
      if (current === generation && !disposed) {
        loading.value = false
      }
    }
  }

  watch(options.conversationId, () => {
    generation++
    data.value = null
    error.value = null
    void refresh()
  }, { flush: 'sync' })
  watch(() => [options.branchId.value, options.runs.value.map(run => `${run.id}:${run.status}`).join(',')], () => void refresh())
  watch(visible, (value) => {
    if (value) {
      void refresh()
    }
    else {
      generation++

      loading.value = false
    }
  })
  onScopeDispose(() => {
    disposed = true

    generation++
  })
  return {
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    setVisible: (value: boolean) => {
      visible.value = value
    },
  }
}
