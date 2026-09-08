import type { ShallowRef } from 'vue'
import type { DesktopBrowserGuestSurfaceHost } from './browserGuestSurface'
import { shallowRef, watch } from 'vue'

export function useBrowserGuestHost(host: Readonly<ShallowRef<DesktopBrowserGuestSurfaceHost | null>>): DesktopBrowserGuestSurfaceHost {
  const activeSurface = shallowRef<{ element: HTMLElement, sessionId: string } | null>(null)

  watch(host, (value) => {
    const surface = activeSurface.value
    if (value && surface)
      value.show(surface.sessionId, surface.element)
  })

  return {
    show(sessionId, element) {
      activeSurface.value = { element, sessionId }
      host.value?.show(sessionId, element)
    },
    hide(sessionId, element) {
      const surface = activeSurface.value
      if (surface?.sessionId !== sessionId || (element && surface.element !== element))
        return
      activeSurface.value = null
      host.value?.hide(sessionId, element)
    },
  }
}
