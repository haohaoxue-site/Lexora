import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { ToolCall } from '@langchain/core/messages'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import { ToolMessage } from '@langchain/core/messages'
import { DEFAULT_RUNTIME_SKILL_ADAPTERS } from '../skills/adapters'
import {
  executeAgentSkillToolCalls,
  isAgentSkillToolCall,
  isSkillLoaded,
} from '../skills/runtime'

export async function executeRuntimeToolCalls(input: {
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  context: AgentGraphContext
  sessionId: string
  toolCalls: ToolCall[]
  loadedSkills: LoadedAgentSkill[]
}): Promise<{
  toolMessages: ToolMessage[]
  operations: ChatMemoryOperationProjection[]
  loadedSkills: LoadedAgentSkill[]
}> {
  const toolMessages: ToolMessage[] = []
  const operations: ChatMemoryOperationProjection[] = []
  let loadedSkills = input.loadedSkills
  const services = {
    memoryApi: input.memoryApi,
    webSearch: input.webSearch,
  }
  const skillAdapters = input.skillAdapters ?? DEFAULT_RUNTIME_SKILL_ADAPTERS
  const handledToolCalls = new Set<ToolCall>()
  const skillCalls = input.skillApi ? input.toolCalls.filter(isAgentSkillToolCall) : []
  if (skillCalls.length > 0 && input.skillApi) {
    const result = await executeAgentSkillToolCalls({
      skillApi: input.skillApi,
      context: input.context,
      toolCalls: skillCalls,
      loadedSkills,
    })
    loadedSkills = result.loadedSkills
    toolMessages.push(...result.toolMessages)
    skillCalls.forEach(toolCall => handledToolCalls.add(toolCall))
  }

  for (const adapter of skillAdapters) {
    if (
      !adapter.isAvailable({ context: input.context, services })
      || (input.skillApi && !isSkillLoaded(loadedSkills, adapter.key))
    ) {
      continue
    }

    const adapterCalls = input.toolCalls.filter(toolCall => adapter.isToolCall(toolCall))
    if (adapterCalls.length === 0) {
      continue
    }

    const result = await adapter.executeToolCalls({
      context: input.context,
      services,
      sessionId: input.sessionId,
      toolCalls: adapterCalls,
    })
    operations.push(...result.memoryOperations ?? [])
    toolMessages.push(...result.toolMessages)
    adapterCalls.forEach(toolCall => handledToolCalls.add(toolCall))
  }

  for (const toolCall of input.toolCalls) {
    if (handledToolCalls.has(toolCall)) {
      continue
    }

    toolMessages.push(new ToolMessage({
      tool_call_id: toolCall.id ?? `${toolCall.name}:missing-id`,
      status: 'error',
      content: JSON.stringify({
        status: 'failed',
        reason: `Tool is not available in the current skill state: ${toolCall.name}`,
      }),
    }))
  }

  return {
    toolMessages,
    operations,
    loadedSkills,
  }
}
