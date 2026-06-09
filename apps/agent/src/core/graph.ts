import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../integrations/model-providers/chat-model'
import { END, START, StateGraph } from '@langchain/langgraph'
import {
  createCallModelNode,
  createCompactHistoryNode,
  createPrepareContextNode,
} from './nodes'
import { AgentGraphState } from './state'

export interface CreateAgentGraphOptions {
  chatModelFactory: AgentChatModelFactory
  checkpointer?: BaseCheckpointSaver
}

export function createAgentGraph(options: CreateAgentGraphOptions) {
  return new StateGraph(AgentGraphState)
    .addNode('prepareContext', createPrepareContextNode())
    .addNode('compactHistory', createCompactHistoryNode())
    .addNode('callModel', createCallModelNode({
      chatModelFactory: options.chatModelFactory,
    }))
    .addEdge(START, 'prepareContext')
    .addEdge('prepareContext', 'compactHistory')
    .addEdge('compactHistory', 'callModel')
    .addEdge('callModel', END)
    .compile({
      name: 'samepage.agent.core',
      checkpointer: options.checkpointer,
    })
}
