import type {
  ChatGenerationBootstrap,
} from '@haohaoxue/samepage-contracts'
import {
  ChatGenerationBootstrapSchema,
} from '@haohaoxue/samepage-contracts'
import { normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface AgentChatApiClient {
  getGenerationBootstrap: (options: AgentGetGenerationBootstrapOptions) => Promise<ChatGenerationBootstrap>
}

export interface AgentGetGenerationBootstrapOptions {
  generationId: string
}

export function createAgentChatApiClient(apiInternalUrl: string): AgentChatApiClient {
  const baseUrl = normalizeApiInternalBaseUrl(apiInternalUrl)

  return {
    async getGenerationBootstrap(options) {
      return ChatGenerationBootstrapSchema.parse(await postApiInternalJson({
        baseUrl,
        path: `internal/chat/generations/${encodeURIComponent(options.generationId)}/bootstrap`,
        payload: {},
        errorMessage: '读取聊天生成上下文失败',
      }))
    },
  }
}
