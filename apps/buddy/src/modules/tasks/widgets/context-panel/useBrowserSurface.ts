import type { DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import type { DesktopBrowserGuestSurfaceHost } from '@/platform/browser/browserGuestSurface'
import { watch } from 'vue'

export function useBrowserSurface(options: {
  api: Pick<DesktopBrowserApi, 'setSurface'>
  guestHost: DesktopBrowserGuestSurfaceHost
  sessionId: Readonly<Ref<string | null>>
  element: Readonly<Ref<HTMLElement | null>>
}) {
  watch([options.sessionId, options.element], async ([sessionId, element], _previous, onCleanup) => {
    if (!sessionId || !element)
      return
    let active = true
    onCleanup(() => {
      active = false
      options.guestHost.hide(sessionId, element)
      void options.api.setSurface({ sessionId, visible: false }).catch(() => {})
    })
    options.guestHost.show(sessionId, element)
    try {
      await options.api.setSurface({ sessionId, visible: true })
    }
    catch {
      if (active)
        options.guestHost.hide(sessionId, element)
    }
  }, { immediate: true, flush: 'post' })
}
