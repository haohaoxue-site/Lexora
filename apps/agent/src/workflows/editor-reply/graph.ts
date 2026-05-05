import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import { END, START, StateGraph } from '@langchain/langgraph'
import { createEditorReplyLlmCallNode } from './nodes'
import { EditorReplyState } from './state'

export interface CreateEditorReplyGraphOptions {
  chatModelFactory: AgentChatModelFactory
  name: string
}

export function createEditorReplyGraph(options: CreateEditorReplyGraphOptions) {
  return new StateGraph(EditorReplyState)
    .addNode('llmCall', createEditorReplyLlmCallNode({
      chatModelFactory: options.chatModelFactory,
    }))
    .addEdge(START, 'llmCall')
    .addEdge('llmCall', END)
    .compile({
      name: options.name,
    })
}
