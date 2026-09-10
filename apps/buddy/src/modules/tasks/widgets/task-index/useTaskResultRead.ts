import type { Ref } from 'vue'
import type { TaskMarks } from '../../contracts'
import { useDocumentVisibility, useEventListener, useIntersectionObserver, useMutationObserver, useWindowFocus } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

export function useTaskResultRead(options: {
  root: Readonly<Ref<HTMLElement | null>>
  conversationId: Readonly<Ref<string | null>>
  marks: () => TaskMarks
  disabled: Readonly<Ref<boolean>>
}) {
  const focused = useWindowFocus()
  const visibility = useDocumentVisibility()
  const targets = shallowRef<HTMLElement[]>([])
  const state = computed(() => {
    const id = options.conversationId.value
    return id ? options.marks().states.value.get(id) : null
  })
  let frame: number | null = null
  let disposed = false

  function check() {
    frame = null
    if (disposed)
      return
    const current = state.value
    const elements = current?.unread && current.resultRunId
      ? [...options.root.value?.querySelectorAll<HTMLElement>('[data-task-result-run-id]') ?? []]
          .filter(element => element.dataset.taskResultRunId === current.resultRunId)
      : []
    if (elements.length !== targets.value.length || elements.some((element, index) => element !== targets.value[index]))
      targets.value = elements
    if (options.disabled.value || !focused.value || visibility.value !== 'visible'
      || !current?.resultRunId || !elements.some(isResultVisible)) {
      return
    }
    void options.marks().readResult(current.conversationId, current.resultRunId, current.readRevision)
  }

  function schedule() {
    if (frame === null && !disposed)
      frame = requestAnimationFrame(check)
  }

  watch(options.conversationId, (id) => {
    if (id)
      options.marks().beginVisit(id)
    schedule()
  }, { immediate: true, flush: 'post' })
  watch([state, focused, visibility, options.disabled, options.root], schedule, { flush: 'post' })
  useMutationObserver(options.root, schedule, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-task-result-run-id', 'inert'] })
  useIntersectionObserver(targets, schedule)
  useEventListener(options.root, 'scroll', schedule, { capture: true, passive: true })
  useEventListener(window, 'resize', schedule)
  useEventListener(document, 'focusin', schedule)
  onScopeDispose(() => {
    disposed = true
    if (frame !== null)
      cancelAnimationFrame(frame)
  })
}

export function isResultVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[inert], [aria-hidden="true"]'))
    return false
  const bounds = element.getBoundingClientRect()
  let left = Math.max(0, bounds.left)
  let top = Math.max(0, bounds.top)
  let right = Math.min(window.innerWidth, bounds.right)
  let bottom = Math.min(window.innerHeight, bounds.bottom)
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false
    if (parent === element)
      continue
    const rect = parent.getBoundingClientRect()
    if (style.overflowX !== 'visible') {
      left = Math.max(left, rect.left)
      right = Math.min(right, rect.right)
    }
    if (style.overflowY !== 'visible') {
      top = Math.max(top, rect.top)
      bottom = Math.min(bottom, rect.bottom)
    }
  }
  if (right - left < 1 || bottom - top < 1)
    return false
  const visible = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
  return visible !== null && element.contains(visible)
}
