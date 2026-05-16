import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import { AGENT_WORKFLOW_KEY } from '@haohaoxue/samepage-contracts'
import { END, START, StateGraph } from '@langchain/langgraph'
import {
  createLlmCallNode,
  createPrepareChatReplyContextNode,
} from './nodes'
import { ChatReplyState } from './state'

export interface CreateChatReplyGraphOptions {
  chatModelFactory: AgentChatModelFactory
  checkpointer?: BaseCheckpointSaver
}

export function createChatReplyGraph(options: CreateChatReplyGraphOptions) {
  return new StateGraph(ChatReplyState)
    .addNode('prepareContext', createPrepareChatReplyContextNode())
    .addNode('llmCall', createLlmCallNode({
      chatModelFactory: options.chatModelFactory,
    }))
    .addEdge(START, 'prepareContext')
    .addEdge('prepareContext', 'llmCall')
    .addEdge('llmCall', END)
    .compile({
      name: AGENT_WORKFLOW_KEY.CHAT_REPLY,
      checkpointer: options.checkpointer,
    })
}
