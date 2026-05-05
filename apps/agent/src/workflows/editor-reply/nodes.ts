import type { GraphNode } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { EditorReplyGraphContext, EditorReplyState } from './state'
import { consumeChatModelTextStream } from '../../integrations/model-providers/stream-text'
import { buildEditorReplyMessages } from './prompts'

export interface CreateEditorReplyLlmCallNodeOptions {
  chatModelFactory: AgentChatModelFactory
}

export function createEditorReplyLlmCallNode(
  options: CreateEditorReplyLlmCallNodeOptions,
): GraphNode<typeof EditorReplyState, EditorReplyGraphContext> {
  return async (state, config) => {
    const modelTarget = config.context?.modelTarget ?? config.configurable?.modelTarget ?? null

    if (!modelTarget) {
      throw new Error('editor reply 缺少模型运行目标')
    }

    const model = options.chatModelFactory.createChatModel(modelTarget)
    const stream = await model.stream(buildEditorReplyMessages(state.editorContext), {
      signal: config.signal,
    })

    return {
      responseText: await consumeChatModelTextStream(stream, {
        onTextDelta: config.context?.onTextDelta,
      }),
    }
  }
}
