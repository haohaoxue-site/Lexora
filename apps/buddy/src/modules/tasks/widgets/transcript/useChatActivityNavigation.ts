import type { ComponentPublicInstance } from 'vue'

export function useChatActivityNavigation() {
  const views = new Map<string, (nodeId: string) => void>()
  function register(id: string, view: Element | ComponentPublicInstance | null) {
    if (view && 'revealActivity' in view && typeof view.revealActivity === 'function') {
      const reveal = view.revealActivity
      views.set(id, nodeId => reveal(nodeId))
    }
    else {
      views.delete(id)
    }
  }
  return { register, reveal: (id: string, nodeId: string) => views.get(id)?.(nodeId) }
}
