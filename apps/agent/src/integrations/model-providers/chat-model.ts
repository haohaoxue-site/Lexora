import type { BaseMessage, MessageContent } from '@langchain/core/messages'
import type { AgentRunModelTarget } from '../../runtime/typing'
import { AI_MODEL_AUTH_MODE } from '@haohaoxue/samepage-contracts'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'

const MODEL_CALL_TIMEOUT_MS = 60_000

export interface AgentChatModel {
  stream: (messages: BaseMessage[], options?: { signal?: AbortSignal }) => Promise<AsyncIterable<AgentChatModelResponse>>
}

export interface AgentChatModelResponse {
  content: MessageContent
}

export interface AgentChatModelFactory {
  createChatModel: (target: AgentRunModelTarget) => AgentChatModel
}

export function createChatModelFactory(): AgentChatModelFactory {
  return {
    createChatModel(target) {
      ensureCredentialReady(target)

      switch (target.adapterKey) {
        case 'openai-chat-completions':
          return new ChatOpenAI({
            model: target.modelId,
            temperature: 0,
            timeout: MODEL_CALL_TIMEOUT_MS,
            maxRetries: 1,
            apiKey: target.apiKey ?? 'samepage-no-auth',
            configuration: {
              baseURL: target.endpoint,
            },
            useResponsesApi: false,
          })
        case 'anthropic-messages':
          return new ChatAnthropic({
            model: target.modelId,
            temperature: 0,
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

function ensureCredentialReady(target: AgentRunModelTarget): void {
  if (target.authMode !== AI_MODEL_AUTH_MODE.NONE && !target.apiKey) {
    throw new Error('模型服务未提供 API Key')
  }
}
