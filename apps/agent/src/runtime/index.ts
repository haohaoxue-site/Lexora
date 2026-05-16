import type { AgentIdempotencyStore } from './command'
import type { AgentCommandQueue, AgentControlHandler, AgentEventPublisher, AgentWorkflow } from './typing'
import { createAgentCommandWorker } from './command'
import { createAgentWorkflowRuntime } from './workflow'

export interface CreateAgentRuntimeOptions {
  queue: AgentCommandQueue
  workflows?: AgentWorkflow[]
  events?: AgentEventPublisher
  idempotency?: AgentIdempotencyStore
  onControl?: AgentControlHandler
  now?: () => number
}

export interface AgentRuntime {
  start: () => Promise<void>
  stop: () => Promise<void>
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime {
  const workflowRuntime = createAgentWorkflowRuntime({
    workflows: options.workflows,
    events: options.events,
    now: options.now,
  })
  const commandWorker = createAgentCommandWorker({
    idempotency: options.idempotency,
    onControl: options.onControl,
    queue: options.queue,
    workflowRuntime,
  })

  return {
    async start() {
      await commandWorker.start()
    },

    async stop() {
      await commandWorker.stop()
      await options.events?.close?.()
    },
  }
}

export * from './command'
export * from './typing'
export * from './workflow'
