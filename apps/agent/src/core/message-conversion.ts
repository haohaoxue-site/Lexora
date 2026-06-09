import type { AgentChatContextMessage } from '@haohaoxue/samepage-contracts'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage } from '@langchain/core/messages'

export function toLangChainChatMessages(messages: AgentChatContextMessage[]): BaseMessage[] {
  return messages.map(toLangChainChatMessage)
}

export function toLangChainChatMessage(message: AgentChatContextMessage): BaseMessage {
  if (message.role === 'assistant') {
    return new AIMessage({
      id: message.id,
      content: message.content,
    })
  }

  return new HumanMessage({
    id: message.id,
    content: message.content,
  })
}
