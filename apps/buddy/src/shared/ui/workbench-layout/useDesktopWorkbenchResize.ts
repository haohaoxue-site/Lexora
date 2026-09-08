import type { Ref } from 'vue'
import type { DesktopWorkbenchResizablePanel } from './desktopWorkbenchLayout'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  readonly,
  shallowRef,
  watch,
} from 'vue'
import {
  clampDesktopWorkbenchPanelWidth,
  DESKTOP_WORKBENCH_WIDTH_LIMITS,
  resolveDesktopWorkbenchPanelRange,
  resolveDesktopWorkbenchWidths,
} from './desktopWorkbenchLayout'

interface UseDesktopWorkbenchResizeOptions {
  container: Readonly<Ref<HTMLElement | null>>
  context: Readonly<Ref<HTMLElement | null>>
  sidebar: Readonly<Ref<HTMLElement | null>>
  sidebarResizable: () => boolean
}

const KEYBOARD_RESIZE_STEP = 16
const KEYBOARD_RESIZE_LARGE_STEP = 48

export function useDesktopWorkbenchResize(options: UseDesktopWorkbenchResizeOptions) {
  const activePanel = shallowRef<DesktopWorkbenchResizablePanel | null>(null)
  const containerWidth = shallowRef(0)
  const preferredContextWidth = shallowRef<number | null>(null)
  const preferredSidebarWidth = shallowRef<number | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let activePointerId: number | null = null

  const contextVisible = computed(() => options.context.value !== null)
  const widths = computed(() => resolveDesktopWorkbenchWidths({
    containerWidth: containerWidth.value,
    contextVisible: contextVisible.value,
    preferredContextWidth: preferredContextWidth.value
      ?? DESKTOP_WORKBENCH_WIDTH_LIMITS.context.minimum,
    preferredSidebarWidth: preferredSidebarWidth.value
      ?? DESKTOP_WORKBENCH_WIDTH_LIMITS.sidebar.minimum,
  }))
  const sidebarRange = computed(() => resolvePanelRange('sidebar'))
  const contextRange = computed(() => resolvePanelRange('context'))
  const layoutStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {}
    if (preferredSidebarWidth.value !== null && options.sidebarResizable())
      style['--buddy-workspace-sidebar-width'] = `${widths.value.sidebarWidth}px`
    if (preferredContextWidth.value !== null && contextVisible.value)
      style['--buddy-context-panel-width'] = `${widths.value.contextWidth}px`
    return style
  })

  function measureLayout(): void {
    const container = options.container.value
    if (!container)
      return

    containerWidth.value = container.getBoundingClientRect().width
    if (preferredSidebarWidth.value === null && options.sidebar.value)
      preferredSidebarWidth.value = options.sidebar.value.getBoundingClientRect().width
    if (preferredContextWidth.value === null && options.context.value)
      preferredContextWidth.value = options.context.value.getBoundingClientRect().width
  }

  function resolvePanelRange(panel: DesktopWorkbenchResizablePanel) {
    return resolveDesktopWorkbenchPanelRange(panel, {
      containerWidth: containerWidth.value,
      contextVisible: contextVisible.value,
      contextWidth: widths.value.contextWidth,
      sidebarWidth: widths.value.sidebarWidth,
    })
  }

  function setPanelWidth(panel: DesktopWorkbenchResizablePanel, width: number): void {
    const nextWidth = clampDesktopWorkbenchPanelWidth(width, resolvePanelRange(panel))
    if (panel === 'sidebar')
      preferredSidebarWidth.value = nextWidth
    else
      preferredContextWidth.value = nextWidth
  }

  function resizeFromClientX(panel: DesktopWorkbenchResizablePanel, clientX: number): void {
    const bounds = options.container.value?.getBoundingClientRect()
    if (!bounds)
      return
    setPanelWidth(
      panel,
      panel === 'sidebar' ? clientX - bounds.left : bounds.right - clientX,
    )
  }

  function beginResize(panel: DesktopWorkbenchResizablePanel, event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary)
      return
    measureLayout()
    preferredSidebarWidth.value = options.sidebar.value?.getBoundingClientRect().width
      ?? preferredSidebarWidth.value
    preferredContextWidth.value = options.context.value?.getBoundingClientRect().width
      ?? preferredContextWidth.value
    activePanel.value = panel
    activePointerId = event.pointerId
    resizeFromClientX(panel, event.clientX)
    window.addEventListener('blur', finishResize)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd)
    event.preventDefault()
  }

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId || !activePanel.value)
      return
    resizeFromClientX(activePanel.value, event.clientX)
    event.preventDefault()
  }

  function handlePointerEnd(event: PointerEvent): void {
    if (event.pointerId === activePointerId)
      finishResize()
  }

  function finishResize(): void {
    activePanel.value = null
    activePointerId = null
    window.removeEventListener('blur', finishResize)
    window.removeEventListener('pointercancel', handlePointerEnd)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerEnd)
  }

  function handleResizeKeydown(
    panel: DesktopWorkbenchResizablePanel,
    event: KeyboardEvent,
  ): void {
    const range = resolvePanelRange(panel)
    const currentWidth = panel === 'sidebar'
      ? widths.value.sidebarWidth
      : widths.value.contextWidth
    const step = event.shiftKey ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP
    let nextWidth: number | null = null

    if (event.key === 'Home')
      nextWidth = range.minimum
    else if (event.key === 'End')
      nextWidth = range.maximum
    else if (event.key === 'ArrowLeft')
      nextWidth = currentWidth + (panel === 'context' ? step : -step)
    else if (event.key === 'ArrowRight')
      nextWidth = currentWidth + (panel === 'context' ? -step : step)

    if (nextWidth === null)
      return
    setPanelWidth(panel, nextWidth)
    event.preventDefault()
  }

  onMounted(() => {
    measureLayout()
    resizeObserver = new ResizeObserver(measureLayout)
    if (options.container.value)
      resizeObserver.observe(options.container.value)
  })

  watch(options.context, async (context) => {
    if (!context || preferredContextWidth.value !== null)
      return
    await nextTick()
    measureLayout()
  }, { flush: 'post' })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    finishResize()
  })

  return {
    activePanel: readonly(activePanel),
    contextRange,
    contextWidth: computed(() => widths.value.contextWidth),
    layoutStyle,
    sidebarRange,
    sidebarWidth: computed(() => widths.value.sidebarWidth),
    beginResize,
    handleResizeKeydown,
  }
}
