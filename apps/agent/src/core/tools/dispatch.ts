import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { ToolCall } from '@langchain/core/messages'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import { ToolMessage } from '@langchain/core/messages'
import { isGraphInterrupt } from '@langchain/langgraph'
import {
  executeAgentSkillToolCalls,
  isAgentSkillToolCall,
} from '../skills/runtime'
import {
  createRuntimeSkillAdapterServices,
  createRuntimeToolRegistry,
} from './registry'

export async function executeRuntimeToolCalls(input: {
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  context: AgentGraphContext
  sessionId: string
  toolCalls: ToolCall[]
  loadedSkills: LoadedAgentSkill[]
  observer?: RuntimeToolExecutionObserver
}): Promise<{
  toolMessages: ToolMessage[]
  operations: ChatMemoryOperationProjection[]
  loadedSkills: LoadedAgentSkill[]
}> {
  const toolMessages: ToolMessage[] = []
  const operations: ChatMemoryOperationProjection[] = []
  let loadedSkills = input.loadedSkills
  const services = createRuntimeSkillAdapterServices(input)
  let registry = createRuntimeToolRegistry({
    ...input,
    loadedSkills,
  })
  const handledToolCalls = new Set<ToolCall>()
  const skillCalls = input.skillApi
    ? input.toolCalls.filter(toolCall =>
        isAgentSkillToolCall(toolCall) && registry.hasVisibleTool(toolCall.name),
      )
    : []
  if (skillCalls.length > 0 && input.skillApi) {
    const result = await executeObservedToolCallGroup(input.observer, skillCalls, () =>
      executeAgentSkillToolCalls({
        skillApi: input.skillApi!,
        context: input.context,
        toolCalls: skillCalls,
        loadedSkills,
      }))
    loadedSkills = result.loadedSkills
    toolMessages.push(...result.toolMessages)
    skillCalls.forEach(toolCall => handledToolCalls.add(toolCall))
    registry = createRuntimeToolRegistry({
      ...input,
      loadedSkills,
    })
  }

  for (const adapter of registry.availableSkillAdapters) {
    const adapterCalls = input.toolCalls.filter(toolCall => !handledToolCalls.has(toolCall) && adapter.isToolCall(toolCall))
    if (adapterCalls.length === 0) {
      continue
    }

    const result = await executeObservedToolCallGroup(input.observer, adapterCalls, () =>
      adapter.executeToolCalls({
        context: input.context,
        services,
        sessionId: input.sessionId,
        toolCalls: adapterCalls,
      }))
    operations.push(...result.memoryOperations ?? [])
    toolMessages.push(...result.toolMessages)
    adapterCalls.forEach(toolCall => handledToolCalls.add(toolCall))
  }

  const unavailableToolCalls: ToolCall[] = []
  for (const toolCall of input.toolCalls) {
    if (handledToolCalls.has(toolCall)) {
      continue
    }

    unavailableToolCalls.push(toolCall)
  }

  if (unavailableToolCalls.length > 0) {
    await input.observer?.onToolCallsStarted?.(unavailableToolCalls)
    const unavailableToolMessages = unavailableToolCalls.map(toolCall => new ToolMessage({
      tool_call_id: toolCall.id ?? `${toolCall.name}:missing-id`,
      status: 'error',
      content: JSON.stringify({
        status: 'failed',
        reason: `Tool is not available in the current skill state: ${toolCall.name}`,
      }),
    }))
    toolMessages.push(...unavailableToolMessages)
    await input.observer?.onToolCallsCompleted?.(unavailableToolCalls, unavailableToolMessages)
  }

  return {
    toolMessages,
    operations,
    loadedSkills,
  }
}

export interface RuntimeToolExecutionObserver {
  onToolCallsStarted?: (toolCalls: ToolCall[]) => Promise<void>
  onToolCallsCompleted?: (toolCalls: ToolCall[], toolMessages: ToolMessage[]) => Promise<void>
  onToolCallsFailed?: (toolCalls: ToolCall[], error: unknown) => Promise<void>
}

async function executeObservedToolCallGroup<TResult extends {
  toolMessages: ToolMessage[]
}>(
  observer: RuntimeToolExecutionObserver | undefined,
  toolCalls: ToolCall[],
  execute: () => Promise<TResult>,
): Promise<TResult> {
  await observer?.onToolCallsStarted?.(toolCalls)

  try {
    const result = await execute()
    await observer?.onToolCallsCompleted?.(toolCalls, result.toolMessages)
    return result
  }
  catch (error) {
    if (!isGraphInterrupt(error)) {
      await observer?.onToolCallsFailed?.(toolCalls, error)
    }

    throw error
  }
}
