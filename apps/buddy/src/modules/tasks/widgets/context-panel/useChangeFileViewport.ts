import type { Ref } from 'vue'
import { watch } from 'vue'

export type ObserveChangeFile = (element: HTMLElement, update: (visible: boolean) => void) => () => void

export function useChangeFileViewport(root: Readonly<Ref<HTMLElement | null>>): ObserveChangeFile {
  const listeners = new Map<Element, (visible: boolean) => void>()
  let observer: IntersectionObserver | null = null
  watch(root, (element, _previous, onCleanup) => {
    if (!element)
      return
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries)
        listeners.get(entry.target)?.(entry.isIntersecting)
    }, { root: element, rootMargin: '300px 0px' })
    for (const target of listeners.keys())
      observer.observe(target)
    onCleanup(() => {
      observer?.disconnect()
      observer = null
    })
  }, { immediate: true, flush: 'post' })
  return (element, update) => {
    listeners.set(element, update)
    observer?.observe(element)
    return () => {
      observer?.unobserve(element)
      listeners.delete(element)
    }
  }
}
