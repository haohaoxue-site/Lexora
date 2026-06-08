import type { AgentChatContextMessage } from '@haohaoxue/samepage-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentChatModelFactory } from '../integrations/model-providers/chat-model'
import type { AgentGraphContext, AgentGraphState } from './state'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Overwrite } from '@langchain/langgraph'
import { consumeChatModelTextStream } from '../integrations/model-providers/stream-text'
import { trimAgentContextWindow } from './checkpoint'
import { applyAgentContextSnapshotsToMessages } from './context-window'
import { createAgentSystemPrompt } from './prompt'

export interface CreateCallModelNodeOptions {
  chatModelFactory: AgentChatModelFactory
}

export function createCallModelNode(options: CreateCallModelNodeOptions): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    const modelTarget = config.context?.modelTarget ?? config.configurable?.modelTarget ?? null

    if (!modelTarget) {
      throw new Error('Agent generation 缺少模型运行目标')
    }

    const modelOptions = config.context?.modelOptions ?? null
    const model = modelOptions
      ? options.chatModelFactory.createChatModel(modelTarget, modelOptions)
      : options.chatModelFactory.createChatModel(modelTarget)
    const modelMessages = applyAgentContextSnapshotsToMessages(state.messages, {
      triggerUserMessageId: config.context?.triggerUserMessageId,
      contextSnapshots: config.context?.contextSnapshots,
    })
    const langChainMessages = toLangChainMessages(
      modelMessages,
      state.olderMessagesExcerpt,
      config.context?.agentProfileConfig,
    )

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

export function createPrepareContextNode(): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    const trimmedContext = trimAgentContextWindow({
      olderMessagesExcerpt: state.olderMessagesExcerpt,
      messages: state.messages,
    }, config.context?.contextPolicy)

    return {
      olderMessagesExcerpt: trimmedContext.olderMessagesExcerpt,
      messages: new Overwrite(trimmedContext.messages),
    }
  }
}

function toLangChainMessages(
  messages: AgentChatContextMessage[],
  olderMessagesExcerpt: string,
  agentProfileConfig: AgentGraphContext['agentProfileConfig'],
) {
  return [
    new SystemMessage(createAgentSystemPrompt({
      agentProfileConfig,
      olderMessagesExcerpt,
    })),
    ...messages.map((message) => {
      if (message.role === 'assistant') {
        return new AIMessage(message.content)
      }

      return new HumanMessage(message.content)
    }),
  ]
}
