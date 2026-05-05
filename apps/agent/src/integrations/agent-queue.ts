import type { AgentCommandHandler, AgentCommandQueue, AgentRunCommand } from '../runtime/typing'

export function createMemoryAgentCommandQueue(): AgentCommandQueue {
  const handlers = new Set<AgentCommandHandler>()

  return {
    async publish(command: AgentRunCommand) {
      await Promise.all(Array.from(handlers, handler => handler(command)))
    },

    subscribe(handler) {
      handlers.add(handler)

      return () => {
        handlers.delete(handler)
      }
    },

    async close() {
      handlers.clear()
    },
  }
}
