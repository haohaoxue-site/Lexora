import type {
  AgentEventPublisher,
  AgentRunCommand,
  AgentRunEvent,
  AgentRunEventType,
  AgentWorkflow,
  AgentWorkflowKey,
} from './typing'
import { AGENT_RUN_EVENT_TYPE } from '@haohaoxue/samepage-contracts'

export interface CreateAgentWorkflowRuntimeOptions {
  workflows?: AgentWorkflow[]
  activeRuns?: AgentActiveRunRegistry
  events?: AgentEventPublisher
  now?: () => number
}

export interface AgentWorkflowRuntime {
  submit: (command: AgentRunCommand) => Promise<unknown>
  cancel: (runId: string) => boolean
}

export interface AgentWorkflowRegistry {
  get: (workflowKey: string) => AgentWorkflow | null
  listWorkflowKeys: () => string[]
}

export interface CreateAgentRunEventOptions {
  type: AgentRunEventType
  runId: string
  workflowKey: AgentWorkflowKey
  payload?: unknown
}

export interface AgentConcurrencyGate {
  enter: () => AgentConcurrencyGateResult
}

export interface AgentConcurrencyGateResult {
  accepted: boolean
  release: () => void
}

export interface CreateAgentConcurrencyGateOptions {
  maxConcurrentRuns: number
}

export interface AgentActiveRun {
  runId: string
  workflowKey: AgentWorkflowKey
  abortController: AbortController
  startedAt: number
}

export interface AgentActiveRunRegistry {
  add: (run: AgentActiveRun) => void
  get: (runId: string) => AgentActiveRun | null
  has: (runId: string) => boolean
  remove: (runId: string) => void
  list: () => AgentActiveRun[]
  size: () => number
}

export function createAgentWorkflowRuntime(options: CreateAgentWorkflowRuntimeOptions = {}): AgentWorkflowRuntime {
  const workflowRegistry = createAgentWorkflowRegistry(options.workflows)
  const activeRuns = options.activeRuns ?? createAgentActiveRunRegistry()
  const events = options.events ?? createNoopAgentEventPublisher()
  const now = options.now ?? (() => Date.now())

  return {
    async submit(command) {
      const workflow = workflowRegistry.get(command.workflowKey)

      if (!workflow) {
        throw new Error(`未知 workflowKey: ${command.workflowKey}`)
      }

      const abortController = new AbortController()
      const startedAt = now()

      activeRuns.add({
        runId: command.runId,
        workflowKey: command.workflowKey,
        abortController,
        startedAt,
      })
      await events.publish(createAgentRunEvent({
        type: AGENT_RUN_EVENT_TYPE.RUN_STARTED,
        runId: command.runId,
        workflowKey: command.workflowKey,
      }))

      try {
        const result = await workflow.execute({
          actorId: command.actorId,
          runId: command.runId,
          workflowKey: command.workflowKey,
          context: command.context,
          payload: command.payload,
          modelTarget: command.modelTarget,
          signal: abortController.signal,
          emit: async event => await events.publish(event),
        })
        const durationMs = now() - startedAt

        await events.publish(createAgentRunEvent({
          type: AGENT_RUN_EVENT_TYPE.RUN_COMPLETED,
          runId: command.runId,
          workflowKey: command.workflowKey,
          payload: {
            durationMs,
          },
        }))

        return result
      }
      catch (error) {
        await events.publish(createAgentRunEvent({
          type: AGENT_RUN_EVENT_TYPE.RUN_FAILED,
          runId: command.runId,
          workflowKey: command.workflowKey,
          payload: {
            message: error instanceof Error ? error.message : 'Agent run failed',
          },
        }))
        throw error
      }
      finally {
        activeRuns.remove(command.runId)
      }
    },

    cancel(runId) {
      const activeRun = activeRuns.get(runId)

      if (!activeRun) {
        return false
      }

      activeRun.abortController.abort()
      return true
    },
  }
}

export function createAgentWorkflowRegistry(workflows: AgentWorkflow[] = []): AgentWorkflowRegistry {
  const workflowMap = new Map<string, AgentWorkflow>()

  for (const workflow of workflows) {
    if (workflowMap.has(workflow.workflowKey)) {
      throw new Error(`重复的 workflowKey: ${workflow.workflowKey}`)
    }

    workflowMap.set(workflow.workflowKey, workflow)
  }

  return {
    get(workflowKey) {
      return workflowMap.get(workflowKey) ?? null
    },

    listWorkflowKeys() {
      return Array.from(workflowMap.keys())
    },
  }
}

export function createAgentRunEvent(options: CreateAgentRunEventOptions): AgentRunEvent {
  return {
    type: options.type,
    runId: options.runId,
    workflowKey: options.workflowKey,
    payload: options.payload,
  }
}

export function createAgentConcurrencyGate(options: CreateAgentConcurrencyGateOptions): AgentConcurrencyGate {
  let activeRuns = 0

  return {
    enter() {
      if (activeRuns >= options.maxConcurrentRuns) {
        return {
          accepted: false,
          release() {},
        }
      }

      activeRuns += 1
      let released = false

      return {
        accepted: true,
        release() {
          if (released) {
            return
          }

          released = true
          activeRuns = Math.max(0, activeRuns - 1)
        },
      }
    },
  }
}

function createAgentActiveRunRegistry(): AgentActiveRunRegistry {
  const activeRuns = new Map<string, AgentActiveRun>()

  return {
    add(run) {
      if (activeRuns.has(run.runId)) {
        throw new Error(`重复执行中的 runId: ${run.runId}`)
      }

      activeRuns.set(run.runId, run)
    },

    get(runId) {
      return activeRuns.get(runId) ?? null
    },

    has(runId) {
      return activeRuns.has(runId)
    },

    remove(runId) {
      activeRuns.delete(runId)
    },

    list() {
      return Array.from(activeRuns.values())
    },

    size() {
      return activeRuns.size
    },
  }
}

function createNoopAgentEventPublisher(): AgentEventPublisher {
  return {
    async publish() {},
  }
}
