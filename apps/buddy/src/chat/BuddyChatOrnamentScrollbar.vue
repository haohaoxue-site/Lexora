<script setup lang="ts">
import type { CSSProperties } from 'vue'
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

const props = defineProps<{
  contentHeight: number
  scrollTop: number
  viewportHeight: number
}>()

const emit = defineEmits<{
  scrollTo: [scrollTop: number]
}>()

interface BuddyOrnamentScrollbarDragState {
  maxScrollTop: number
  maxThumbOffset: number
  pointerId: number
  startClientY: number
  startThumbOffset: number
}

const trackRef = useTemplateRef<HTMLElement>('trackRef')
const dragState = shallowRef<BuddyOrnamentScrollbarDragState | null>(null)
const trackHeight = shallowRef(0)
const visualThumbHeight = 40
let resizeObserver: ResizeObserver | null = null

const maxScrollTop = computed(() =>
  Math.max(0, props.contentHeight - props.viewportHeight),
)

const isScrollable = computed(() =>
  props.contentHeight > props.viewportHeight + 4,
)

const isDragging = computed(() => dragState.value !== null)

const thumbMetrics = computed(() => {
  const nextTrackHeight = trackHeight.value
  if (!isScrollable.value || nextTrackHeight <= 0) {
    return {
      height: visualThumbHeight,
      offset: 0,
    }
  }

  const nextHeight = Math.min(visualThumbHeight, nextTrackHeight)
  const nextMaxOffset = Math.max(0, nextTrackHeight - nextHeight)

  return {
    height: nextHeight,
    offset: Math.round(scrollTopToThumbOffset(props.scrollTop, maxScrollTop.value, nextMaxOffset)),
  }
})

const maxThumbOffset = computed(() =>
  Math.max(0, trackHeight.value - thumbMetrics.value.height),
)

const ariaValueMax = computed(() => Math.round(maxScrollTop.value))

const ariaValueNow = computed(() =>
  Math.round(clamp(props.scrollTop, 0, maxScrollTop.value)),
)

const thumbStyle = computed<CSSProperties>(() => ({
  transform: `translate3d(0, ${thumbMetrics.value.offset}px, 0)`,
}) as CSSProperties)

watch(trackRef, (element) => {
  resizeObserver?.disconnect()
  resizeObserver = null

  if (!element) {
    trackHeight.value = 0
    return
  }

  updateTrackHeight(element)

  if (typeof ResizeObserver === 'undefined')
    return

  resizeObserver = new ResizeObserver(() => updateTrackHeight(element))
  resizeObserver.observe(element)
}, {
  flush: 'post',
  immediate: true,
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function updateTrackHeight(element: HTMLElement) {
  trackHeight.value = Math.round(element.getBoundingClientRect().height)
}

function handleThumbPointerDown(event: PointerEvent) {
  if (!isScrollable.value || event.button !== 0)
    return

  const nextMaxScrollTop = maxScrollTop.value
  const nextMaxThumbOffset = maxThumbOffset.value
  if (nextMaxScrollTop <= 0 || nextMaxThumbOffset <= 0)
    return

  dragState.value = {
    maxScrollTop: nextMaxScrollTop,
    maxThumbOffset: nextMaxThumbOffset,
    pointerId: event.pointerId,
    startClientY: event.clientY,
    startThumbOffset: scrollTopToThumbOffset(props.scrollTop, nextMaxScrollTop, nextMaxThumbOffset),
  }

  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.setPointerCapture(event.pointerId)

  event.preventDefault()
}

function handleThumbPointerMove(event: PointerEvent) {
  const state = dragState.value
  if (!state || state.pointerId !== event.pointerId)
    return

  const nextThumbOffset = clamp(
    state.startThumbOffset + event.clientY - state.startClientY,
    0,
    state.maxThumbOffset,
  )
  emitScrollTo((nextThumbOffset / state.maxThumbOffset) * state.maxScrollTop)
  event.preventDefault()
}

function handleThumbPointerUp(event: PointerEvent) {
  finishThumbDrag(event)
}

function handleThumbPointerCancel(event: PointerEvent) {
  finishThumbDrag(event)
}

function handleThumbLostPointerCapture(event: PointerEvent) {
  if (dragState.value?.pointerId === event.pointerId)
    dragState.value = null
}

function handleThumbKeydown(event: KeyboardEvent) {
  if (!isScrollable.value)
    return

  const smallStep = 48
  const largeStep = Math.max(160, props.viewportHeight * 0.8)
  let nextScrollTop: number | null = null

  switch (event.key) {
    case 'ArrowDown':
      nextScrollTop = props.scrollTop + smallStep
      break
    case 'ArrowUp':
      nextScrollTop = props.scrollTop - smallStep
      break
    case 'End':
      nextScrollTop = maxScrollTop.value
      break
    case 'Home':
      nextScrollTop = 0
      break
    case 'PageDown':
      nextScrollTop = props.scrollTop + largeStep
      break
    case 'PageUp':
      nextScrollTop = props.scrollTop - largeStep
      break
    default:
      return
  }

  emitScrollTo(nextScrollTop)
  event.preventDefault()
}

function finishThumbDrag(event: PointerEvent) {
  if (dragState.value?.pointerId !== event.pointerId)
    return

  dragState.value = null

  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId)

  event.preventDefault()
}

function emitScrollTo(scrollTop: number) {
  emit('scrollTo', clamp(Math.round(scrollTop), 0, maxScrollTop.value))
}

function scrollTopToThumbOffset(scrollTop: number, nextMaxScrollTop: number, nextMaxThumbOffset: number) {
  if (nextMaxScrollTop <= 0 || nextMaxThumbOffset <= 0)
    return 0

  return (clamp(scrollTop, 0, nextMaxScrollTop) / nextMaxScrollTop) * nextMaxThumbOffset
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
</script>

<template>
  <div
    class="buddy-ornament-scrollbar"
    :class="{ 'is-visible': isScrollable, 'is-dragging': isDragging }"
  >
    <div
      ref="trackRef"
      aria-hidden="true"
      class="buddy-ornament-scrollbar__track"
    >
      <span class="buddy-ornament-scrollbar__cord" />
      <span class="buddy-ornament-scrollbar__bead is-top" />
      <span class="buddy-ornament-scrollbar__bead is-upper" />
      <span class="buddy-ornament-scrollbar__bead is-lower" />
      <span class="buddy-ornament-scrollbar__end-star" />
    </div>

    <span aria-hidden="true" class="buddy-ornament-scrollbar__cap" />
    <span aria-hidden="true" class="buddy-ornament-scrollbar__hook" />
    <span aria-hidden="true" class="buddy-ornament-scrollbar__sparkle" />

    <div
      :aria-valuemax="ariaValueMax"
      aria-valuemin="0"
      :aria-valuenow="ariaValueNow"
      aria-label="滚动对话"
      aria-orientation="vertical"
      class="buddy-ornament-scrollbar__thumb"
      :class="{ 'is-dragging': isDragging }"
      role="scrollbar"
      :style="thumbStyle"
      :tabindex="isScrollable ? 0 : -1"
      @keydown="handleThumbKeydown"
      @lostpointercapture="handleThumbLostPointerCapture"
      @pointercancel="handleThumbPointerCancel"
      @pointerdown="handleThumbPointerDown"
      @pointermove="handleThumbPointerMove"
      @pointerup="handleThumbPointerUp"
    >
      <span aria-hidden="true" class="buddy-ornament-scrollbar__thumb-ring" />
      <span aria-hidden="true" class="buddy-ornament-scrollbar__crystal" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.buddy-ornament-scrollbar {
  position: absolute;
  z-index: 4;
  top: 8px;
  right: -2px;
  bottom: 14px;
  width: 31px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.buddy-ornament-scrollbar.is-visible {
  opacity: 0.9;
}

.buddy-ornament-scrollbar__track {
  position: absolute;
  top: 36px;
  right: 3px;
  bottom: 27px;
  width: 14px;
}

.buddy-ornament-scrollbar__cord {
  position: absolute;
  inset: 2px 6px 2px auto;
  width: 2px;
  background:
    linear-gradient(
      180deg,
      rgb(237 196 106 / 0%) 0%,
      rgb(237 196 106 / 78%) 12%,
      rgb(190 133 53 / 64%) 52%,
      rgb(237 196 106 / 76%) 88%,
      rgb(237 196 106 / 0%) 100%
    );
  box-shadow:
    0 0 4px rgb(255 236 179 / 62%),
    0 0 1px rgb(135 88 33 / 34%);
}

.buddy-ornament-scrollbar__bead {
  position: absolute;
  right: 2px;
  width: 7px;
  height: 7px;
  background: url('../assets/window/scrollbar-ornaments/bead-medium.png') center / contain no-repeat;
  filter: drop-shadow(0 1px 2px rgb(82 48 18 / 20%));
  transform: translateY(-50%);
}

.buddy-ornament-scrollbar__bead.is-top {
  top: 0;
}

.buddy-ornament-scrollbar__bead.is-upper {
  top: 35%;
  width: 5px;
  height: 5px;
}

.buddy-ornament-scrollbar__bead.is-lower {
  top: 72%;
  width: 6px;
  height: 6px;
}

.buddy-ornament-scrollbar__cap {
  position: absolute;
  top: 0;
  right: 0;
  width: 25px;
  height: 31px;
  background: url('../assets/window/scrollbar-ornaments/crescent-cap.png') center / contain no-repeat;
  filter:
    drop-shadow(0 2px 2px rgb(83 54 21 / 18%))
    drop-shadow(0 0 6px rgb(255 237 176 / 42%));
}

.buddy-ornament-scrollbar__hook {
  position: absolute;
  top: 25px;
  right: 5.5px;
  width: 10px;
  height: 18px;
  background: url('../assets/window/scrollbar-ornaments/double-cord.png') center / 100% 100% no-repeat;
  filter: drop-shadow(0 1px 1px rgb(84 54 18 / 16%));
}

.buddy-ornament-scrollbar__sparkle {
  position: absolute;
  top: 14px;
  right: 21px;
  width: 7px;
  height: 7px;
  background: url('../assets/window/scrollbar-ornaments/sparkle.png') center / contain no-repeat;
  filter: drop-shadow(0 0 5px rgb(255 240 190 / 58%));
  opacity: 0.78;
}

.buddy-ornament-scrollbar__thumb {
  position: absolute;
  top: 36px;
  right: -1px;
  width: 24px;
  height: 40px;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  will-change: transform;
}

.buddy-ornament-scrollbar__thumb.is-dragging {
  cursor: grabbing;
}

.buddy-ornament-scrollbar__thumb:focus-visible {
  outline: none;
}

.buddy-ornament-scrollbar__thumb:focus-visible .buddy-ornament-scrollbar__crystal {
  filter:
    drop-shadow(0 2px 2px rgb(29 66 85 / 22%))
    drop-shadow(0 0 10px rgb(104 226 244 / 68%));
}

.buddy-ornament-scrollbar__thumb-ring {
  position: absolute;
  top: -5px;
  right: 6px;
  width: 10px;
  height: 15px;
  background: url('../assets/window/scrollbar-ornaments/bead-cluster.png') center top / contain no-repeat;
  filter: drop-shadow(0 1px 1px rgb(70 43 18 / 18%));
}

.buddy-ornament-scrollbar__crystal {
  position: absolute;
  top: 5px;
  right: 1px;
  width: 20px;
  height: 34px;
  background: url('../assets/window/scrollbar-ornaments/crystal-thumb.png') center / contain no-repeat;
  filter:
    drop-shadow(0 2px 2px rgb(29 66 85 / 22%))
    drop-shadow(0 0 7px rgb(133 226 239 / 40%));
}

.buddy-ornament-scrollbar__end-star {
  position: absolute;
  right: -3px;
  bottom: -23px;
  width: 20px;
  height: 25px;
  background: url('../assets/window/scrollbar-ornaments/end-star.png') center / contain no-repeat;
  filter:
    drop-shadow(0 2px 2px rgb(82 52 19 / 20%))
    drop-shadow(0 0 7px rgb(255 234 164 / 46%));
}
</style>
