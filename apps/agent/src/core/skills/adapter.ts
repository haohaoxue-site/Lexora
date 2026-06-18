import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { ToolCall, ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { WebSearchClient } from '../../integrations/web-search'
import type { AgentGraphContext } from '../state'

export interface RuntimeSkillAdapterServices {
  memoryApi?: AgentMemoryApiClient
  webSearch?: WebSearchClient
}

export interface RuntimeSkillAdapter {
  key: string
  toolNames: readonly string[]
  isAvailable: (input: {
    context: AgentGraphContext | undefined
    services: RuntimeSkillAdapterServices
  }) => boolean
  createTools: (input: {
    context: AgentGraphContext | undefined
    services: RuntimeSkillAdapterServices
  }) => StructuredToolInterface[]
  isToolCall: (toolCall: ToolCall) => boolean
  executeToolCalls: (input: {
    context: AgentGraphContext
    services: RuntimeSkillAdapterServices
    sessionId: string
    toolCalls: ToolCall[]
  }) => Promise<{
    toolMessages: ToolMessage[]
    memoryOperations?: ChatMemoryOperationProjection[]
  }>
}
