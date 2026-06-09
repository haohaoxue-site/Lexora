import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { AgentChatApiClient } from '../clients/chat'
import type {
  AgentChatModelFactory,
  AgentChatModelOptions,
} from '../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../integrations/model-providers/stream-text'
import type { AgentRuntimeTryLock } from '../runtime/lock'
import type {
  AgentEventPublisher,
  AgentRunner,
  ChatGenerationEvent,
} from '../runtime/typing'
import {
  AgentGenerationCommandSchema,
  AgentProfileConfigSchema,
  ChatGenerationBootstrapSchema,
} from '@haohaoxue/samepage-contracts'
import { createMemoryAgentRuntimeTryLock } from '../runtime/lock'
import {
  readAgentCheckpointState,
  resolveAgentGraphInput,
} from './checkpoint'
import {
  createAgentGenerationLifecycleEvent,
  emitAgentModelStreamPart,
} from './events'
import { createAgentGraph } from './graph'

export interface CreateAgentRunnerInput {
  chatApi: AgentChatApiClient
  chatModelFactory: AgentChatModelFactory
  checkpointer?: BaseCheckpointSaver
  threadRunTryLock?: AgentRuntimeTryLock
  events?: AgentEventPublisher
  now?: () => number
}

export function createAgentRunner(inputs: CreateAgentRunnerInput): AgentRunner {
  const events = inputs.events ?? createNoopAgentEventPublisher()
  const now = inputs.now ?? (() => Date.now())
  const activeRuns = new Map<string, AbortController>()
  const graph = createAgentGraph({
    chatModelFactory: inputs.chatModelFactory,
    checkpointer: inputs.checkpointer,
  })
  const threadRunTryLock = inputs.threadRunTryLock ?? createMemoryAgentRuntimeTryLock()

  return {
    async submit(rawCommand) {
      const command = AgentGenerationCommandSchema.parse(rawCommand)
      const generationId = command.generationId

      if (activeRuns.has(generationId)) {
        throw new Error(`Agent generation is already running: ${generationId}`)
      }

      const abortController = new AbortController()
      const startedAt = now()
      activeRuns.set(generationId, abortController)
      await events.publish(createAgentGenerationLifecycleEvent({
        type: 'generation.started',
        generationId,
      }))

      try {
        const bootstrap = ChatGenerationBootstrapSchema.parse(await inputs.chatApi.getGenerationBootstrap({
          generationId,
        }))
        const result = await executeAgentGeneration({
          bootstrap,
          checkpointer: inputs.checkpointer,
          emit: async event => await events.publish(event),
          graph,
          signal: abortController.signal,
          threadRunTryLock,
        })
        const durationMs = now() - startedAt

        await events.publish(createAgentGenerationLifecycleEvent({
          type: 'generation.completed',
          generationId,
          payload: {
            durationMs,
            usage: result.usageSnapshot ?? undefined,
          },
        }))

        return {
          text: result.responseText,
        }
      }
      catch (error) {
        if (abortController.signal.aborted) {
          await events.publish(createAgentGenerationLifecycleEvent({
            type: 'generation.cancelled',
            generationId,
            payload: {
              message: 'Agent generation cancelled',
            },
          }))
          return undefined
        }

        await events.publish(createAgentGenerationLifecycleEvent({
          type: 'generation.failed',
          generationId,
          payload: {
            message: getAgentGenerationErrorMessage(error),
          },
        }))
        throw error
      }
      finally {
        activeRuns.delete(generationId)
      }
    },

    cancel(generationId) {
      const abortController = activeRuns.get(generationId)

      if (!abortController) {
        return false
      }

      abortController.abort()
      return true
    },
  }
}

export async function executeAgentGeneration(input: {
  bootstrap: ReturnType<typeof ChatGenerationBootstrapSchema.parse>
  graph: ReturnType<typeof createAgentGraph>
  checkpointer?: BaseCheckpointSaver
  threadRunTryLock: AgentRuntimeTryLock
  signal: AbortSignal
  emit: (event: ChatGenerationEvent) => Promise<void> | void
}) {
  const profileConfig = AgentProfileConfigSchema.parse(input.bootstrap.agentProfile.currentConfig)
  const threadId = input.bootstrap.context.threadId
  const result = await input.threadRunTryLock.tryRunExclusive(threadId, async () => {
    if (input.bootstrap.context.messages.length === 0) {
      throw new Error('聊天触发消息不存在')
    }

    const checkpointState = await readAgentCheckpointState(input.checkpointer, threadId)
    const graphInputDecision = resolveAgentGraphInput(
      input.bootstrap.context,
      checkpointState,
    )

    if (graphInputDecision.shouldResetCheckpoint) {
      await input.checkpointer?.deleteThread(threadId)
    }

    return await input.graph.invoke(graphInputDecision.graphInput, {
      signal: input.signal,
      configurable: {
        thread_id: threadId,
      },
      context: {
        agentProfileConfig: profileConfig,
        contextPolicy: profileConfig.contextPolicy,
        modelLimits: input.bootstrap.model,
        modelOptions: toChatModelOptions(profileConfig),
        modelTarget: input.bootstrap.runtimeModelTarget,
        triggerUserMessageId: input.bootstrap.context.triggerUserMessageId,
        contextSnapshots: input.bootstrap.context.contextSnapshots,
        onStreamPart: async (part: AgentModelStreamPart) => await emitAgentModelStreamPart(part, {
          emit: input.emit,
          generationId: input.bootstrap.generation.generationId,
        }),
      },
    })
  })

  if (!result) {
    throw new Error(`聊天会话正在运行: ${input.bootstrap.context.sessionId}`)
  }

  return result
}

function toChatModelOptions(profileConfig: ReturnType<typeof AgentProfileConfigSchema.parse>): AgentChatModelOptions {
  return removeUndefined({
    maxOutputTokens: profileConfig.modelPolicy.maxOutputTokens,
    reasoningEffort: profileConfig.modelPolicy.reasoningEffort,
    temperature: profileConfig.modelPolicy.temperature,
    topP: profileConfig.modelPolicy.topP,
  })
}

function createNoopAgentEventPublisher(): AgentEventPublisher {
  return {
    async publish() {},
  }
}

function getAgentGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return 'Agent generation failed'
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T
}
