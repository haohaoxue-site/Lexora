import type { ChatMemoryOperationProjection } from '@haohaoxue/samepage-contracts'
import type { BaseMessage } from '@langchain/core/messages'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { AgentChatModel } from '../../integrations/model-providers/chat-model'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import type { AgentModelCallResult } from './types'
import { AIMessage } from '@langchain/core/messages'
import { consumeChatModelTextStream } from '../../integrations/model-providers/stream-text'
import { executeRuntimeToolCalls } from './dispatch'
import {
  addModelCallMetrics,
  createAggregatedModelCallMetrics,
} from './metrics'
import { resolveRuntimeVisibleTools } from './visibility'

export async function callModelWithRuntimeTools(input: {
  model: AgentChatModel
  messages: BaseMessage[]
  sessionId: string
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  signal?: AbortSignal
}): Promise<AgentModelCallResult> {
  if (!input.model.bindTools) {
    return streamModelWithoutTools(input)
  }

  const messages = [...input.messages]
  const metrics = createAggregatedModelCallMetrics()
  const memoryOperations: ChatMemoryOperationProjection[] = []
  let loadedSkills: LoadedAgentSkill[] = []
  let tools = resolveRuntimeVisibleTools({
    context: input.context,
    memoryApi: input.memoryApi,
    skillApi: input.skillApi,
    skillAdapters: input.skillAdapters,
    loadedSkills,
  })

  if (tools.length === 0) {
    return streamModelWithoutTools({
      ...input,
      messages,
    })
  }

  let lastResult = await consumeStreamingModelCall(
    input.model.bindTools(tools, { tool_choice: 'auto' }),
    messages,
    input.signal,
    input.context,
  )
  addModelCallMetrics(metrics, lastResult)

  for (let round = 0; round < 3 && lastResult.toolCalls.length > 0; round += 1) {
    messages.push(new AIMessage({
      content: lastResult.text,
      tool_calls: lastResult.toolCalls,
    }))

    const toolResult = await executeRuntimeToolCalls({
      memoryApi: input.memoryApi,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      context: input.context ?? {},
      sessionId: input.sessionId,
      toolCalls: lastResult.toolCalls,
      loadedSkills,
    })
    loadedSkills = toolResult.loadedSkills
    memoryOperations.push(...toolResult.operations)
    messages.push(...toolResult.toolMessages)

    tools = resolveRuntimeVisibleTools({
      context: input.context,
      memoryApi: input.memoryApi,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      loadedSkills,
    })

    lastResult = round === 2 || tools.length === 0
      ? await consumeStreamingModelCall(input.model, messages, input.signal, input.context)
      : await consumeStreamingModelCall(
          input.model.bindTools(tools, { tool_choice: 'auto' }),
          messages,
          input.signal,
          input.context,
        )
    addModelCallMetrics(metrics, lastResult)
  }

  return {
    ...lastResult,
    providerUsage: metrics.providerUsage,
    firstTokenLatencyMs: metrics.firstTokenLatencyMs,
    elapsedMs: metrics.elapsedMs,
    memoryOperations,
  }
}

async function streamModelWithoutTools(input: {
  model: AgentChatModel
  messages: BaseMessage[]
  context: AgentGraphContext | undefined
  signal?: AbortSignal
}): Promise<AgentModelCallResult> {
  const stream = await input.model.stream(input.messages, {
    signal: input.signal,
  })

  return consumeChatModelTextStream(stream, {
    onStreamPart: input.context?.onStreamPart,
  }).then(result => ({
    ...result,
    memoryOperations: [],
  }))
}

async function consumeStreamingModelCall(
  model: AgentChatModel,
  messages: BaseMessage[],
  signal: AbortSignal | undefined,
  context: AgentGraphContext | undefined,
) {
  const stream = await model.stream(messages, { signal })
  return consumeChatModelTextStream(stream, {
    onStreamPart: context?.onStreamPart,
  })
}
