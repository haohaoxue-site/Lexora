import type {
  DesktopBrowserApi,
  DesktopBrowserBounds,
  DesktopBrowserState,
} from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

export type BrowserSurfaceFailure
  = | 'control'
    | 'local-file'
    | 'navigation'
    | 'navigation-input'
    | 'profile'
    | 'profile-reset'
    | 'session'
    | 'surface'

interface UseBrowserContextSurfaceOptions {
  api: DesktopBrowserApi
  conversationId: Readonly<Ref<string>>
  surfaceElement: Readonly<Ref<HTMLElement | null>>
  toolbarFocusElement: Readonly<Ref<HTMLElement | null>>
}

export function useBrowserContextSurface(options: UseBrowserContextSurfaceOptions) {
  const state = shallowRef<DesktopBrowserState | null>(null)
  const failure = shallowRef<BrowserSurfaceFailure | null>(null)
  const isLoading = computed(() => state.value?.status === 'loading')
  const isEnablingPersonalProfile = shallowRef(false)
  const isOpeningLocalFile = shallowRef(false)
  const isResettingPersonalProfile = shallowRef(false)
  const isTakingControl = shallowRef(false)
  let animationFrame: number | null = null
  let blockedByOverlay = false
  let lifecycle = 0
  let mounted = false
  let overlayObserver: MutationObserver | null = null
  let stopStateChanged: (() => void) | null = null
  let stopToolbarFocusRequested: (() => void) | null = null

  useResizeObserver(options.surfaceElement, scheduleSurface)

  onMounted(() => {
    mounted = true
    const currentLifecycle = ++lifecycle
    stopStateChanged = options.api.onStateChanged((nextState) => {
      if (nextState.conversationId !== options.conversationId.value)
        return
      state.value = nextState
      void nextTick(scheduleSurface)
    })
    stopToolbarFocusRequested = options.api.onToolbarFocusRequested((request) => {
      if (
        request.conversationId !== options.conversationId.value
        || request.sessionId !== state.value?.sessionId
      ) {
        return
      }
      options.toolbarFocusElement.value?.focus()
    })
    blockedByOverlay = hasBlockingDesktopOverlay()
    overlayObserver = new MutationObserver(updateOverlayVisibility)
    overlayObserver.observe(document.body, {
      attributeFilter: ['aria-hidden', 'class', 'style'],
      attributes: true,
      childList: true,
      subtree: true,
    })
    document.addEventListener('visibilitychange', scheduleSurface)
    window.addEventListener('resize', scheduleSurface)
    void ensureSession(currentLifecycle)
  })

  onBeforeUnmount(() => {
    mounted = false
    lifecycle += 1
    stopStateChanged?.()
    stopStateChanged = null
    stopToolbarFocusRequested?.()
    stopToolbarFocusRequested = null
    overlayObserver?.disconnect()
    overlayObserver = null
    document.removeEventListener('visibilitychange', scheduleSurface)
    window.removeEventListener('resize', scheduleSurface)
    if (animationFrame !== null)
      cancelAnimationFrame(animationFrame)
    animationFrame = null
    const sessionId = state.value?.sessionId
    if (sessionId)
      void options.api.setSurface({ sessionId, visible: false }).catch(() => {})
  })

  async function ensureSession(currentLifecycle: number): Promise<void> {
    try {
      const nextState = await options.api.ensureSession(options.conversationId.value)
      if (!mounted || lifecycle !== currentLifecycle) {
        await options.api.setSurface({ sessionId: nextState.sessionId, visible: false })
        return
      }
      state.value = nextState
      failure.value = null
      await nextTick()
      scheduleSurface()
    }
    catch {
      if (mounted && lifecycle === currentLifecycle)
        failure.value = 'session'
    }
  }

  async function navigate(rawAddress: string): Promise<boolean> {
    const sessionId = state.value?.sessionId
    const url = normalizeBrowserAddress(rawAddress)
    if (!url) {
      failure.value = 'navigation-input'
      return false
    }
    if (!sessionId) {
      failure.value = 'navigation'
      return false
    }
    try {
      state.value = await options.api.navigate(sessionId, url)
      failure.value = null
      return true
    }
    catch {
      failure.value = 'navigation'
      return false
    }
  }

  async function openLocalFile(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (!sessionId || isOpeningLocalFile.value)
      return false
    isOpeningLocalFile.value = true
    try {
      const nextState = await options.api.openLocalFile(sessionId)
      if (!nextState)
        return false
      state.value = nextState
      failure.value = null
      await nextTick()
      scheduleSurface()
      return true
    }
    catch {
      failure.value = 'local-file'
      return false
    }
    finally {
      isOpeningLocalFile.value = false
    }
  }

  async function enablePersonalProfile(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (
      !sessionId
      || state.value?.profileMode === 'personal'
      || isEnablingPersonalProfile.value
    ) {
      return false
    }
    isEnablingPersonalProfile.value = true
    try {
      state.value = await options.api.enablePersonalProfile(sessionId)
      failure.value = null
      await nextTick()
      scheduleSurface()
      return true
    }
    catch {
      failure.value = 'profile'
      return false
    }
    finally {
      isEnablingPersonalProfile.value = false
    }
  }

  async function resetPersonalProfile(): Promise<boolean> {
    const sessionId = state.value?.sessionId
    if (
      !sessionId
      || state.value?.profileMode !== 'personal'
      || isResettingPersonalProfile.value
    ) {
      return false
    }
    isResettingPersonalProfile.value = true
    try {
      state.value = await options.api.resetPersonalProfile(sessionId)
      failure.value = null
      await nextTick()
      scheduleSurface()
      return true
    }
    catch {
      failure.value = 'profile-reset'
      return false
    }
    finally {
      isResettingPersonalProfile.value = false
    }
  }

  function goBack(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.goBack(sessionId))
  }

  function focusPage(): Promise<boolean> {
    return runSessionCommand(sessionId => options.api.focusPage(sessionId))
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
      failure.value = null
      return true
    }
    catch {
      failure.value = 'control'
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
    if (!sessionId) {
      failure.value = 'navigation'
      return false
    }
    try {
      await command(sessionId)
      failure.value = null
      return true
    }
    catch {
      failure.value = 'navigation'
      return false
    }
  }

  function scheduleSurface(): void {
    if (!mounted || animationFrame !== null)
      return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null
      void syncSurface()
    })
  }

  function updateOverlayVisibility(): void {
    const nextBlockedByOverlay = hasBlockingDesktopOverlay()
    if (nextBlockedByOverlay === blockedByOverlay)
      return
    blockedByOverlay = nextBlockedByOverlay
    scheduleSurface()
  }

  async function syncSurface(): Promise<void> {
    const sessionId = state.value?.sessionId
    if (!sessionId)
      return
    const element = options.surfaceElement.value
    const bounds = !document.hidden && !blockedByOverlay && element
      ? toDesktopBrowserBounds(element.getBoundingClientRect())
      : null
    try {
      await options.api.setSurface(bounds
        ? { bounds, sessionId, visible: true }
        : { sessionId, visible: false })
      if (failure.value === 'surface')
        failure.value = null
    }
    catch {
      failure.value = 'surface'
    }
  }

  return {
    enablePersonalProfile,
    failure: readonly(failure),
    focusPage,
    goBack,
    goForward,
    isLoading: readonly(isLoading),
    isEnablingPersonalProfile: readonly(isEnablingPersonalProfile),
    isOpeningLocalFile: readonly(isOpeningLocalFile),
    isResettingPersonalProfile: readonly(isResettingPersonalProfile),
    isTakingControl: readonly(isTakingControl),
    navigate,
    openLocalFile,
    reload,
    resetPersonalProfile,
    state: readonly(state),
    stop,
    takeControl,
  }
}

export function toDesktopBrowserBounds(
  rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
): DesktopBrowserBounds | null {
  const values = [rect.bottom, rect.left, rect.right, rect.top]
  if (values.some(value => !Number.isFinite(value)))
    return null
  const x = Math.floor(rect.left)
  const y = Math.floor(rect.top)
  const width = Math.ceil(rect.right) - x
  const height = Math.ceil(rect.bottom) - y
  return width > 0 && height > 0 ? { height, width, x, y } : null
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

function hasBlockingDesktopOverlay(): boolean {
  return [...document.querySelectorAll<HTMLElement>(
    '.n-image-preview-overlay, .n-modal-body-wrapper',
  )].some((element) => {
    const style = getComputedStyle(element)
    return element.ariaHidden !== 'true'
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  })
}
