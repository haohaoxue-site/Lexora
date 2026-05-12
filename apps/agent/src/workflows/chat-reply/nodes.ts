import type { AgentChatContextMessage } from '@haohaoxue/samepage-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { ChatReplyGraphContext, ChatReplyState } from './state'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { consumeChatModelTextStream } from '../../integrations/model-providers/stream-text'
import { CHAT_REPLY_SYSTEM_PROMPT } from './prompts'

export interface CreateLlmCallNodeOptions {
  chatModelFactory: AgentChatModelFactory
}

export function createLlmCallNode(options: CreateLlmCallNodeOptions): GraphNode<typeof ChatReplyState, ChatReplyGraphContext> {
  return async (state, config) => {
    const modelTarget = config.context?.modelTarget ?? config.configurable?.modelTarget ?? null

    if (!modelTarget) {
      throw new Error('chat.reply 缺少模型运行目标')
    }

    const model = options.chatModelFactory.createChatModel(modelTarget)
    const stream = await model.stream(toLangChainMessages(state.messages), {
      signal: config.signal,
    })

    return {
      responseText: await consumeChatModelTextStream(stream, {
        onStreamPart: config.context?.onStreamPart,
      }),
    }
  }
}

function toLangChainMessages(messages: AgentChatContextMessage[]) {
  return [
    new SystemMessage(CHAT_REPLY_SYSTEM_PROMPT),
    ...messages.map((message) => {
      if (message.role === 'assistant') {
        return new AIMessage(message.content)
      }

      return new HumanMessage(message.content)
    }),
  ]
}
