import type { Ref } from 'vue'
import { useElementSize, useEventListener } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

export function useConversationDetailResize(container: Readonly<Ref<HTMLElement | null>>, visible: Readonly<Ref<boolean>>) {
  const { width: containerWidth } = useElementSize(container)
  const preferredWidth = shallowRef<number | null>(null)
  const drag = shallowRef<{ x: number, width: number, pointerId: number, element: HTMLElement } | null>(null)
  const maximum = computed(() => Math.max(0, containerWidth.value - Math.min(320, containerWidth.value * 0.4)))
  const minimum = computed(() => Math.min(320, maximum.value))
  const clamp = (value: number) => Math.min(maximum.value, Math.max(minimum.value, value))
  const width = computed(() => clamp(preferredWidth.value ?? Math.min(520, containerWidth.value / 2)))

  function stop() {
    if (drag.value?.element.hasPointerCapture(drag.value.pointerId))
      drag.value.element.releasePointerCapture(drag.value.pointerId)
    drag.value = null
  }

  function begin(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || !(event.currentTarget instanceof HTMLElement))
      return
    drag.value = { x: event.clientX, width: width.value, pointerId: event.pointerId, element: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function keydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 48 : 16
    const next = event.key === 'Home'
      ? minimum.value
      : event.key === 'End'
        ? maximum.value
        : event.key === 'ArrowLeft' ? width.value + step : event.key === 'ArrowRight' ? width.value - step : null
    if (next === null)
      return
    preferredWidth.value = clamp(next)
    event.preventDefault()
  }

  useEventListener('pointermove', (event: PointerEvent) => {
    if (drag.value?.pointerId === event.pointerId)
      preferredWidth.value = clamp(drag.value.width + drag.value.x - event.clientX)
  })
  useEventListener(['pointerup', 'pointercancel'], (event: PointerEvent) => {
    if (drag.value?.pointerId === event.pointerId)
      stop()
  })
  useEventListener('blur', stop)
  watch(visible, (value) => {
    if (!value)
      stop()
  })
  onScopeDispose(stop)
  return { width, minimum, maximum, dragging: computed(() => drag.value !== null), begin, keydown }
}
