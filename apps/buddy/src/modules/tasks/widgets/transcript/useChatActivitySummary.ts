import type { ChatActivitySummary } from '../../model/transcript/chatActivitySummary'
import { onScopeDispose, shallowRef, watch } from 'vue'

export function useChatActivitySummary(source: () => ChatActivitySummary) {
  const displayed = shallowRef(source())
  let changedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  function clear() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  watch(source, (next) => {
    clear()
    const update = () => {
      if (displayed.value.key !== next.key)
        changedAt = Date.now()
      displayed.value = next
    }
    const remaining = 600 - (Date.now() - changedAt)
    if (next.active !== displayed.value.active || next.immediate || next.key === displayed.value.key || remaining <= 0)
      update()
    else
      timer = setTimeout(update, remaining)
  })
  onScopeDispose(clear)
  return displayed
}
