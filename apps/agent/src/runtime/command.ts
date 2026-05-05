import type { AgentCommandQueue } from './typing'
import type { AgentWorkflowRuntime } from './workflow'
import { AgentRunCommandSchema } from '@haohaoxue/samepage-contracts'

export interface AgentIdempotencyStore {
  markStarted: (idempotencyKey: string) => boolean
  has: (idempotencyKey: string) => boolean
  clear: (idempotencyKey: string) => void
}

export interface CreateAgentCommandWorkerOptions {
  queue: AgentCommandQueue
  workflowRuntime: AgentWorkflowRuntime
  idempotency?: AgentIdempotencyStore
}

export interface AgentCommandWorker {
  start: () => Promise<void>
  stop: () => Promise<void>
}

export function createAgentCommandWorker(options: CreateAgentCommandWorkerOptions): AgentCommandWorker {
  const idempotency = options.idempotency ?? createMemoryAgentIdempotencyStore()
  let unsubscribe: (() => void) | null = null

  return {
    async start() {
      if (unsubscribe) {
        return
      }

      await options.queue.ready?.()
      unsubscribe = options.queue.subscribe(async (rawCommand) => {
        const command = AgentRunCommandSchema.parse(rawCommand)

        if (!idempotency.markStarted(command.idempotencyKey)) {
          return
        }

        await options.workflowRuntime.submit(command)
      })
    },

    async stop() {
      unsubscribe?.()
      unsubscribe = null
      await options.queue.close?.()
    },
  }
}

function createMemoryAgentIdempotencyStore(): AgentIdempotencyStore {
  const startedKeys = new Set<string>()

  return {
    markStarted(idempotencyKey) {
      if (startedKeys.has(idempotencyKey)) {
        return false
      }

      startedKeys.add(idempotencyKey)
      return true
    },

    has(idempotencyKey) {
      return startedKeys.has(idempotencyKey)
    },

    clear(idempotencyKey) {
      startedKeys.delete(idempotencyKey)
    },
  }
}
