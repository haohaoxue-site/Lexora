import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import { AGENT_WORKFLOW_KEY } from '@haohaoxue/samepage-contracts'
import { END, START, StateGraph } from '@langchain/langgraph'
import { createLlmCallNode } from './nodes'
import { ChatReplyState } from './state'

export interface CreateChatReplyGraphOptions {
  chatModelFactory: AgentChatModelFactory
}

export function createChatReplyGraph(options: CreateChatReplyGraphOptions) {
  return new StateGraph(ChatReplyState)
    .addNode('llmCall', createLlmCallNode({
      chatModelFactory: options.chatModelFactory,
    }))
    .addEdge(START, 'llmCall')
    .addEdge('llmCall', END)
    .compile({
      name: AGENT_WORKFLOW_KEY.CHAT_REPLY,
    })
}
