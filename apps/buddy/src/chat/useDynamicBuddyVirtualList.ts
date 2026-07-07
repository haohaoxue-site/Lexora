import type {
  ComputedRef,
  CSSProperties,
  Ref,
} from 'vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  watch,
} from 'vue'

interface StoredListScrollState {
  scrollTop: number
  stickToBottom: boolean
}

export interface DynamicBuddyVirtualItem<T> {
  item: T
  index: number
  key: string
  style: CSSProperties
}

export interface DynamicBuddyVirtualListOptions<T> {
  items: Readonly<Ref<readonly T[]>> | ComputedRef<readonly T[]>
  listKey: Readonly<Ref<string | null | undefined>> | ComputedRef<string | null | undefined>
  scrollContainerRef: Readonly<Ref<HTMLElement | null>>
  getItemKey: (item: T, index: number) => string
  estimateSize: number
  overscan?: number
  bottomThreshold?: number
}

const MAX_STORED_LIST_SCROLL_STATE = 24

export function useDynamicBuddyVirtualList<T>(options: DynamicBuddyVirtualListOptions<T>) {
  const overscan = options.overscan ?? 8
  const bottomThreshold = options.bottomThreshold ?? 96
  const scrollTop = shallowRef(0)
  const viewportHeight = shallowRef(0)
  const sizeVersion = shallowRef(0)
  const sizeByKey = new Map<string, number>()
  const elementByKey = new Map<string, HTMLElement>()
  const keyByElement = new Map<Element, string>()
  const scrollStateByListKey = new Map<string, StoredListScrollState>()
  let resizeObserver: ResizeObserver | null = null
  let containerResizeObserver: ResizeObserver | null = null
  let shouldStickToBottom = true
  let pendingScrollBottom = false
  let pendingStoredScrollRestoreKey: string | null = null

  const normalizedListKey = computed(() => options.listKey.value ?? '__default__')
  const itemKeys = computed(() => options.items.value.map(options.getItemKey))
  const keyIndexByKey = computed(() => {
    const indexByKey = new Map<string, number>()
    itemKeys.value.forEach((key, index) => {
      indexByKey.set(key, index)
    })

    return indexByKey
  })
  const offsets = computed<number[]>(() => {
    const nextOffsets = [0]
    let offset = 0

    void sizeVersion.value

    for (const key of itemKeys.value) {
      offset += sizeByKey.get(key) ?? options.estimateSize
      nextOffsets.push(offset)
    }

    return nextOffsets
  })
  const totalHeight = computed(() => offsets.value.at(-1) ?? 0)
  const range = computed(() => resolveDynamicBuddyVirtualRange({
    itemCount: options.items.value.length,
    offsets: offsets.value,
    overscan,
    scrollTop: scrollTop.value,
    viewportHeight: viewportHeight.value,
  }))
  const virtualItems = computed<DynamicBuddyVirtualItem<T>[]>(() => {
    const items = options.items.value
    const keys = itemKeys.value
    const nextItems: DynamicBuddyVirtualItem<T>[] = []

    for (let index = range.value.start; index < range.value.end; index += 1) {
      const item = items[index]
      const key = keys[index]
      if (item === undefined || key === undefined)
        continue

      nextItems.push({
        item,
        index,
        key,
        style: {
          left: '0',
          position: 'absolute',
          right: '0',
          top: '0',
          transform: `translateY(${offsets.value[index] ?? 0}px)`,
          width: '100%',
        },
      })
    }

    return nextItems
  })
  const spacerStyle = computed<CSSProperties>(() => ({
    height: `${totalHeight.value}px`,
    minHeight: '100%',
    position: 'relative',
  }))

  watch(() => options.scrollContainerRef.value, (element) => {
    disconnectContainerResizeObserver()

    if (!element) {
      scrollTop.value = 0
      viewportHeight.value = 0
      return
    }

    updateScrollMetrics()

    if (typeof ResizeObserver !== 'undefined') {
      containerResizeObserver = new ResizeObserver(() => {
        updateScrollMetrics()
        scheduleScrollToBottomIfNeeded()
      })
      containerResizeObserver.observe(element)
    }

    void nextTick(() => restoreListScroll(normalizedListKey.value))
  }, {
    flush: 'post',
    immediate: true,
  })

  watch(normalizedListKey, (nextKey, previousKey) => {
    const element = options.scrollContainerRef.value
    if (element && previousKey)
      saveListScrollState(previousKey, element.scrollTop, shouldStickToBottom || isNearBottom())

    const storedScrollState = scrollStateByListKey.get(nextKey)
    shouldStickToBottom = storedScrollState?.stickToBottom ?? true
    pendingStoredScrollRestoreKey = storedScrollState ? nextKey : null

    void nextTick(() => {
      restoreListScroll(nextKey)

      if (pendingStoredScrollRestoreKey === nextKey)
        pendingStoredScrollRestoreKey = null
    })
  })

  watch(itemKeys, async (nextKeys, previousKeys = []) => {
    const hasKeyStructureChanged = !areStringArraysEqual(nextKeys, previousKeys)

    if (hasKeyStructureChanged)
      pruneMeasurements(nextKeys)

    const shouldRestoreStoredScroll = pendingStoredScrollRestoreKey === normalizedListKey.value
    const wasNearBottom = isNearBottom()
    const shouldScrollBottom = !shouldRestoreStoredScroll
      && hasKeyStructureChanged
      && (shouldStickToBottom || wasNearBottom || previousKeys.length === 0)

    await nextTick()
    updateScrollMetrics()

    if (shouldRestoreStoredScroll) {
      restoreListScroll(normalizedListKey.value)
      pendingStoredScrollRestoreKey = null
      return
    }

    if (shouldScrollBottom)
      scrollToBottom()
  }, {
    flush: 'post',
  })

  onBeforeUnmount(() => {
    disconnectContainerResizeObserver()
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  function handleScroll() {
    updateScrollMetrics()
    shouldStickToBottom = isNearBottom()

    const element = options.scrollContainerRef.value
    if (element)
      saveListScrollState(normalizedListKey.value, element.scrollTop, shouldStickToBottom)
  }

  function setItemElement(key: string, element: Element | null) {
    const previousElement = elementByKey.get(key)
    if (previousElement && previousElement === element)
      return

    if (previousElement && previousElement !== element) {
      resizeObserver?.unobserve(previousElement)
      keyByElement.delete(previousElement)
      elementByKey.delete(key)
    }

    if (!(element instanceof HTMLElement))
      return

    ensureResizeObserver()
    elementByKey.set(key, element)
    keyByElement.set(element, key)
    resizeObserver?.observe(element)
    measureItem(key, element)
  }

  function scrollToBottom() {
    const element = options.scrollContainerRef.value
    if (!element)
      return

    element.scrollTop = element.scrollHeight
    updateScrollMetrics()
    shouldStickToBottom = true
    saveListScrollState(normalizedListKey.value, element.scrollTop, true)
  }

  function updateScrollMetrics() {
    const element = options.scrollContainerRef.value
    if (!element) {
      scrollTop.value = 0
      viewportHeight.value = 0
      return
    }

    scrollTop.value = element.scrollTop
    viewportHeight.value = element.clientHeight
  }

  function restoreListScroll(key: string) {
    const element = options.scrollContainerRef.value
    if (!element)
      return

    const storedScrollState = scrollStateByListKey.get(key)
    if (!storedScrollState) {
      scrollToBottom()
      return
    }

    if (storedScrollState.stickToBottom) {
      scrollToBottom()
      return
    }

    element.scrollTop = storedScrollState.scrollTop
    shouldStickToBottom = false
    updateScrollMetrics()
  }

  function ensureResizeObserver() {
    if (resizeObserver || typeof ResizeObserver === 'undefined')
      return

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = keyByElement.get(entry.target)
        if (!key || !(entry.target instanceof HTMLElement))
          continue

        measureItem(key, entry.target)
      }
    })
  }

  function measureItem(key: string, element: HTMLElement) {
    const nextSize = Math.ceil(element.getBoundingClientRect().height)
    if (nextSize <= 0)
      return

    const previousSize = sizeByKey.get(key) ?? options.estimateSize
    if (previousSize === nextSize && sizeByKey.has(key))
      return

    const index = keyIndexByKey.value.get(key) ?? -1
    const itemTop = index >= 0 ? offsets.value[index] ?? 0 : 0
    const itemBottom = itemTop + previousSize
    const wasNearBottom = isNearScrollBottom(options.scrollContainerRef.value, bottomThreshold)
    const shouldAnchorViewport = !wasNearBottom && itemBottom <= scrollTop.value
    const delta = nextSize - previousSize

    sizeByKey.set(key, nextSize)
    sizeVersion.value += 1

    if (shouldAnchorViewport && delta !== 0) {
      adjustScrollTop(delta)
      return
    }

    if (wasNearBottom || shouldStickToBottom)
      scheduleScrollToBottomIfNeeded()
  }

  function adjustScrollTop(delta: number) {
    const element = options.scrollContainerRef.value
    if (!element)
      return

    element.scrollTop += delta
    updateScrollMetrics()
    saveListScrollState(normalizedListKey.value, element.scrollTop, shouldStickToBottom)
  }

  function scheduleScrollToBottomIfNeeded() {
    if (pendingScrollBottom)
      return

    pendingScrollBottom = true
    requestAnimationFrame(() => {
      pendingScrollBottom = false

      if (shouldStickToBottom || isNearBottom())
        scrollToBottom()
    })
  }

  function isNearBottom() {
    return isNearScrollBottom(options.scrollContainerRef.value, bottomThreshold)
  }

  function pruneMeasurements(keys: readonly string[]) {
    const keySet = new Set(keys)

    for (const key of sizeByKey.keys()) {
      if (!keySet.has(key))
        sizeByKey.delete(key)
    }

    for (const [key, element] of elementByKey.entries()) {
      if (keySet.has(key))
        continue

      resizeObserver?.unobserve(element)
      keyByElement.delete(element)
      elementByKey.delete(key)
    }

    sizeVersion.value += 1
  }

  function disconnectContainerResizeObserver() {
    containerResizeObserver?.disconnect()
    containerResizeObserver = null
  }

  function saveListScrollState(key: string, nextScrollTop: number, stickToBottom: boolean) {
    if (scrollStateByListKey.has(key))
      scrollStateByListKey.delete(key)

    scrollStateByListKey.set(key, {
      scrollTop: nextScrollTop,
      stickToBottom,
    })

    while (scrollStateByListKey.size > MAX_STORED_LIST_SCROLL_STATE) {
      const oldestKey = scrollStateByListKey.keys().next().value
      if (!oldestKey)
        break

      scrollStateByListKey.delete(oldestKey)
    }
  }

  return {
    handleScroll,
    scrollToBottom,
    scrollTop,
    setItemElement,
    spacerStyle,
    totalHeight,
    viewportHeight,
    virtualItems,
  }
}

export function resolveDynamicBuddyVirtualRange(input: {
  itemCount: number
  offsets: readonly number[]
  overscan: number
  scrollTop: number
  viewportHeight: number
}) {
  if (input.itemCount === 0) {
    return {
      end: 0,
      start: 0,
    }
  }

  const viewportEnd = input.scrollTop + input.viewportHeight
  const start = Math.min(
    input.itemCount - 1,
    Math.max(0, findOffsetIndex(input.offsets, input.scrollTop) - input.overscan),
  )
  const end = Math.min(
    input.itemCount,
    Math.max(start + 1, findOffsetIndex(input.offsets, viewportEnd) + input.overscan + 1),
  )

  return {
    end: Math.max(end, start + 1),
    start,
  }
}

function areStringArraysEqual(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length)
    return false

  return first.every((value, index) => value === second[index])
}

function isNearScrollBottom(element: HTMLElement | null, threshold: number) {
  if (!element)
    return true

  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
}

function findOffsetIndex(offsets: readonly number[], target: number) {
  let low = 0
  let high = Math.max(0, offsets.length - 1)

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const nextOffset = offsets[middle + 1] ?? Number.POSITIVE_INFINITY

    if (nextOffset <= target) {
      low = middle + 1
      continue
    }

    high = middle
  }

  return low
}
