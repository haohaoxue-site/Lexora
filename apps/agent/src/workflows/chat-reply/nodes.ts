import type { AgentChatContextMessage } from '@haohaoxue/samepage-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { ChatReplyGraphContext, ChatReplyState } from './state'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Overwrite } from '@langchain/langgraph'
import { consumeChatModelTextStream } from '../../integrations/model-providers/stream-text'
import { applyChatReplyContextSnapshotsToMessages } from './chat-message-context'
import { trimChatReplyMessageContext } from './policy'
import { createChatReplySystemPrompt } from './prompts'

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
    const modelMessages = applyChatReplyContextSnapshotsToMessages(state.messages, {
      triggerUserMessageId: config.context?.triggerUserMessageId,
      contextSnapshots: config.context?.contextSnapshots,
    })
    const langChainMessages = toLangChainMessages(modelMessages, state.olderMessagesExcerpt)

    const stream = await model.stream(langChainMessages, {
      signal: config.signal,
    })

    const responseText = await consumeChatModelTextStream(stream, {
      onStreamPart: config.context?.onStreamPart,
    })

    return {
      responseText,
      messages: [
        {
          id: state.activePathTailMessageId,
          role: 'assistant',
          content: responseText,
        },
      ],
    }
  }
}

export function createPrepareChatReplyContextNode(): GraphNode<typeof ChatReplyState, ChatReplyGraphContext> {
  return async (state) => {
    const trimmedContext = trimChatReplyMessageContext({
      olderMessagesExcerpt: state.olderMessagesExcerpt,
      messages: state.messages,
    })

    return {
      olderMessagesExcerpt: trimmedContext.olderMessagesExcerpt,
      messages: new Overwrite(trimmedContext.messages),
    }
  }
}

function toLangChainMessages(messages: AgentChatContextMessage[], olderMessagesExcerpt: string) {
  return [
    new SystemMessage(createChatReplySystemPrompt(olderMessagesExcerpt)),
    ...messages.map((message) => {
      if (message.role === 'assistant') {
        return new AIMessage(message.content)
      }

      return new HumanMessage(message.content)
    }),
  ]
}
