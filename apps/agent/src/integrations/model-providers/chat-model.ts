import type { BaseMessage, MessageContent } from '@langchain/core/messages'
import type { ChatOpenAICallOptions } from '@langchain/openai'
import type { AgentRuntimeModelTarget } from '../../runtime/typing'
import { AI_PROVIDER_AUTH_MODE } from '@haohaoxue/samepage-contracts'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'

const MODEL_CALL_TIMEOUT_MS = 60_000

export interface AgentChatModel {
  stream: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<AgentChatModelResponse>>
}

export interface AgentChatModelResponse {
  content: MessageContent
}

export interface AgentChatModelOptions {
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface AgentChatModelFactory {
  createChatModel: (target: AgentRuntimeModelTarget, options?: AgentChatModelOptions) => AgentChatModel
}

export function createChatModelFactory(): AgentChatModelFactory {
  return {
    createChatModel(target, options = {}) {
      ensureCredentialReady(target)

      switch (target.adapterKey) {
        case 'openai-chat-completions':
          return createOpenAIChatModel(target, options)
        case 'anthropic-messages':
          return new ChatAnthropic({
            model: target.modelId,
            temperature: options.temperature ?? 0,
            topP: options.topP,
            maxTokens: options.maxOutputTokens,
            maxRetries: 1,
            apiKey: target.apiKey ?? 'samepage-no-auth',
            anthropicApiUrl: target.endpoint,
          })
        default:
          throw new Error(`暂不支持的模型适配器: ${target.adapterKey}`)
      }
    },
  }
}

function createOpenAIChatModel(target: AgentRuntimeModelTarget, options: AgentChatModelOptions): AgentChatModel {
  const model = new ChatOpenAI({
    model: target.modelId,
    temperature: options.temperature ?? 0,
    topP: options.topP,
    maxTokens: options.maxOutputTokens,
    timeout: MODEL_CALL_TIMEOUT_MS,
    maxRetries: 1,
    apiKey: target.apiKey ?? 'samepage-no-auth',
    configuration: {
      baseURL: target.endpoint,
    },
    useResponsesApi: false,
  })

  if (!options.reasoningEffort) {
    return model
  }

  return {
    async stream(messages, streamOptions) {
      const callOptions: ChatOpenAICallOptions = {
        ...streamOptions,
        reasoningEffort: options.reasoningEffort,
      }

      return await model.stream(messages, callOptions)
    },
  }
}

function ensureCredentialReady(target: AgentRuntimeModelTarget): void {
  if (target.authMode !== AI_PROVIDER_AUTH_MODE.NONE && !target.apiKey) {
    throw new Error('服务商未提供 API Key')
  }
}
