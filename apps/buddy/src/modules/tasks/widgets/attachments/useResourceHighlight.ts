import type { Ref } from 'vue'
import { usePreferredReducedMotion, useTimeoutFn } from '@vueuse/core'
import { shallowRef } from 'vue'

export function useResourceHighlight(container: Readonly<Ref<HTMLElement | null>>) {
  const highlightedResourceId = shallowRef<string | null>(null)
  const reducedMotion = usePreferredReducedMotion()
  const { start } = useTimeoutFn(() => {
    highlightedResourceId.value = null
  }, 1_400, { immediate: false })

  function highlightResource(resourceId: string) {
    const card = [...container.value?.querySelectorAll<HTMLElement>('[data-resource-card]') ?? []]
      .find(element => element.dataset.resourceCard === resourceId)
    if (!card)
      return
    card.scrollIntoView({
      behavior: reducedMotion.value === 'reduce' ? 'instant' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
    highlightedResourceId.value = resourceId
    start()
  }

  return { highlightedResourceId, highlightResource }
}
