<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'

defineProps<{ treeVisible: boolean }>()
const width = defineModel<number>('width', { required: true })
const root = useTemplateRef<HTMLElement>('root')
const { width: containerWidth } = useElementSize(root)
const maximum = computed(() => Math.max(120, containerWidth.value - 180))
const renderedWidth = computed(() => Math.min(maximum.value, Math.max(120, width.value)))
const dragging = shallowRef(false)
let drag: { x: number, width: number, pointerId: number, element: HTMLElement } | null = null
let resizeFrame: number | null = null
let pendingWidth: number | null = null
function flushResize() {
  resizeFrame = null
  if (pendingWidth !== null)
    width.value = Math.max(120, Math.min(maximum.value, pendingWidth))
  pendingWidth = null
}
function start(event: PointerEvent) {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement))
    return
  drag = { x: event.clientX, width: renderedWidth.value, pointerId: event.pointerId, element: event.currentTarget }
  event.currentTarget.setPointerCapture(event.pointerId)
  dragging.value = true
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('blur', stop)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId)
    return
  pendingWidth = drag.width + drag.x - event.clientX
  if (resizeFrame === null)
    resizeFrame = requestAnimationFrame(flushResize)
}
function end(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId)
    return
  if (event.type === 'pointerup')
    pendingWidth = drag.width + drag.x - event.clientX
  stop()
}
function stop() {
  if (resizeFrame !== null)
    cancelAnimationFrame(resizeFrame)
  flushResize()
  if (drag?.element.hasPointerCapture(drag.pointerId))
    drag.element.releasePointerCapture(drag.pointerId)
  drag = null
  dragging.value = false
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
  window.removeEventListener('pointercancel', end)
  window.removeEventListener('blur', stop)
}
function resize(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
    return
  width.value = Math.max(120, Math.min(maximum.value, renderedWidth.value + (event.key === 'ArrowLeft' ? 16 : -16)))
  event.preventDefault()
}
onBeforeUnmount(stop)
</script>

<template>
  <div ref="root" class="desktop-context-split" :class="{ 'is-dragging': dragging }">
    <main class="desktop-context-split__content">
      <slot />
    </main>
    <template v-if="treeVisible">
      <div class="desktop-context-split__separator" role="separator" tabindex="0" aria-orientation="vertical" :aria-valuenow="Math.round(renderedWidth)" :aria-valuemin="120" :aria-valuemax="Math.round(maximum)" @pointerdown="start" @keydown="resize" />
      <aside class="desktop-context-split__tree" :style="{ width: `${renderedWidth}px` }">
        <slot name="tree" />
      </aside>
    </template>
  </div>
</template>

<style scoped>
.desktop-context-split { display: flex; width: 100%; min-width: 0; min-height: 0; flex: 1; }
.desktop-context-split__content { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.desktop-context-split__tree { display: flex; flex: none; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; }
.desktop-context-split__separator { position: relative; z-index: 1; width: 1px; flex: none; background: var(--buddy-border-subtle); cursor: col-resize; touch-action: none; }
.desktop-context-split__separator::after { position: absolute; content: ''; inset: 0 -3px; }
.desktop-context-split__separator:hover, .desktop-context-split__separator:focus-visible, .is-dragging .desktop-context-split__separator { background: var(--buddy-focus-ring); outline: none; }
.is-dragging { user-select: none; cursor: col-resize; }
.is-dragging .desktop-context-split__content { pointer-events: none; }
</style>
