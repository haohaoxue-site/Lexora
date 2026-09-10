import type { ComponentPublicInstance } from 'vue'

export function useChatActivityNavigation() {
  const views = new Map<string, { nodeIds?: readonly string[], reveal: (nodeId: string) => void }>()
  function register(id: string, view: Element | ComponentPublicInstance | null, nodeIds?: readonly string[]) {
    if (view && 'revealActivity' in view && typeof view.revealActivity === 'function') {
      const reveal = view.revealActivity
      views.set(id, { nodeIds, reveal: nodeId => reveal(nodeId) })
    }
    else {
      views.delete(id)
    }
  }
  return {
    register,
    reveal: (runId: string, nodeId: string) => {
      const direct = views.get(runId)
      if (direct) {
        direct.reveal(nodeId)
        return
      }
      for (const [key, view] of views) {
        if ((key === `agent-turn:${runId}` || key.startsWith(`agent-turn:${runId}:`)) && view.nodeIds?.includes(nodeId)) {
          view.reveal(nodeId)
          return
        }
      }
    },
  }
}
