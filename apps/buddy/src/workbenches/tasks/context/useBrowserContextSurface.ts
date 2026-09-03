import type {
  DesktopBrowserApi,
  DesktopBrowserProfileMode,
  DesktopBrowserState,
} from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import type { DesktopBrowserGuestSurfaceHost } from '@/app/desktopAppContext'
import { computed, nextTick, onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

interface UseBrowserContextSurfaceOptions {
  api: DesktopBrowserApi
  conversationId: Readonly<Ref<string>>
  guestHost: DesktopBrowserGuestSurfaceHost
  surfaceElement: Readonly<Ref<HTMLElement | null>>
}

export function useBrowserContextSurface(options: UseBrowserContextSurfaceOptions) {
  const state = shallowRef<DesktopBrowserState | null>(null)
  const isLoading = computed(() => state.value?.status === 'loading')
  const isCapturingScreenshot = shallowRef(false)
  const isOpeningExternal = shallowRef(false)
  const isShowingFileInFolder = shallowRef(false)
  const isSwitchingProfile = shallowRef(false)
  const isTakingControl = shallowRef(false)
  let lifecycle = 0
  let mounted = false
  let presentedSurface: { element: HTMLElement, sessionId: string } | null = null
  let stopStateChanged: (() => void) | null = null

  onMounted(() => {
    mounted = true
    const currentLifecycle = ++lifecycle
    stopStateChanged = options.api.onStateChanged((nextState) => {
      if (nextState.conversationId !== options.conversationId.value)
        return
      state.value = nextState
      void nextTick(syncSurface)
    })
    void ensureSession(currentLifecycle)
  })

  onBeforeUnmount(() => {
    mounted = false
    lifecycle += 1
    stopStateChanged?.()
    stopStateChanged = null
    const surface = presentedSurface
    presentedSurface = null
    if (!surface)
      return
    options.guestHost.hide(surface.sessionId, surface.element)
    void options.api.setSurface({ sessionId: surface.sessionId, visible: false }).catch(() => {})
  })

  async function ensureSession(currentLifecycle: number): Promise<void> {
    try {
      const nextState = await options.api.ensureSession(options.conversationId.value)
      if (!mounted || lifecycle !== currentLifecycle)
        return
      state.value = nextState
      await nextTick()
      await syncSurface()
    }
    catch {}
  }

  async function navigate(rawAddress: string): Promise<boolean> {
    const sessionId = state.value?.sessionId
    const url = normalizeBrowserAddress(rawAddress)
    if (!url)
      return false
    if (!sessionId)
      return false
    try {
      state.value = await options.api.navigate(sessionId, url)
      return true
    }
    catch {
      return false
    }
  }

  async function captureScreenshot(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId || isCapturingScreenshot.value)
      return false
    isCapturingScreenshot.value = true
    try {
      const saved = await options.api.captureScreenshot(sessionId)
      return saved
    }
    catch {
      return false
    }
    finally {
      isCapturingScreenshot.value = false
    }
  }

  async function openExternal(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId || isOpeningExternal.value)
      return false
    isOpeningExternal.value = true
    try {
      const opened = await options.api.openExternal(sessionId)
      return opened
    }
    catch {
      return false
    }
    finally {
      isOpeningExternal.value = false
    }
  }

  async function setProfileMode(profileMode: DesktopBrowserProfileMode): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (
      !sessionId
      || state.value?.profileMode === profileMode
      || isSwitchingProfile.value
    ) {
      return false
    }
    isSwitchingProfile.value = true
    try {
      state.value = await options.api.setProfileMode(sessionId, profileMode)
      await nextTick()
      await syncSurface()
      return true
    }
    catch {
      return false
    }
    finally {
      isSwitchingProfile.value = false
    }
  }

  async function showFileInFolder(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId || isShowingFileInFolder.value)
      return false
    isShowingFileInFolder.value = true
    try {
      const opened = await options.api.showFileInFolder(sessionId)
      return opened
    }
    catch {
      return false
    }
    finally {
      isShowingFileInFolder.value = false
    }
  }

  function goBack(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.goBack(sessionId))
  }

  function goForward(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.goForward(sessionId))
  }

  function reload(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.reload(sessionId))
  }

  function stop(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.stop(sessionId))
  }

  async function takeControl(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId || state.value?.controller !== 'agent' || isTakingControl.value)
      return false
    isTakingControl.value = true
    try {
      state.value = await options.api.takeControl(sessionId)
      return true
    }
    catch {
      return false
    }
    finally {
      isTakingControl.value = false
    }
  }

  async function runSessionCommand(
    command: (sessionId: string) => Promise<void>,
  ): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId)
      return false
    try {
      await command(sessionId)
      return true
    }
    catch {
      return false
    }
  }

  async function syncSurface(): Promise<void> {
    const sessionId = state.value?.sessionId
    const element = options.surfaceElement.value
    if (!mounted || !sessionId || !element)
      return

    if (
      presentedSurface
      && (
        presentedSurface.sessionId !== sessionId
        || presentedSurface.element !== element
      )
    ) {
      options.guestHost.hide(presentedSurface.sessionId, presentedSurface.element)
    }
    presentedSurface = { element, sessionId }
    options.guestHost.show(sessionId, element)

    try {
      await options.api.setSurface({ sessionId, visible: true })
    }
    catch {
      options.guestHost.hide(sessionId, element)
      if (
        presentedSurface?.sessionId === sessionId
        && presentedSurface.element === element
      ) {
        presentedSurface = null
      }
    }
  }

  return {
    captureScreenshot,
    goBack,
    goForward,
    isCapturingScreenshot: readonly(isCapturingScreenshot),
    isLoading: readonly(isLoading),
    isOpeningExternal: readonly(isOpeningExternal),
    isShowingFileInFolder: readonly(isShowingFileInFolder),
    isSwitchingProfile: readonly(isSwitchingProfile),
    isTakingControl: readonly(isTakingControl),
    navigate,
    openExternal,
    reload,
    setProfileMode,
    showFileInFolder,
    state: readonly(state),
    stop,
    takeControl,
  }
}

function normalizeBrowserAddress(rawAddress: string): string | null {
  const value = rawAddress.trim()
  if (!value)
    return null
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}
