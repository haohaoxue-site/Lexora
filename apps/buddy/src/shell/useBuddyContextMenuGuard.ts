import type { MaybeRefOrGetter } from 'vue'
import { onMounted, onUnmounted, toValue } from 'vue'
import { isTauriRuntime } from '@/lib/invokeClient'

export function useBuddyContextMenuGuard(allowNativeContextMenu: MaybeRefOrGetter<boolean>) {
  function handleContextMenu(event: MouseEvent) {
    if (!isTauriRuntime() || toValue(allowNativeContextMenu))
      return

    event.preventDefault()
  }

  onMounted(() => {
    window.addEventListener('contextmenu', handleContextMenu, { capture: true })
  })

  onUnmounted(() => {
    window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
  })
}
