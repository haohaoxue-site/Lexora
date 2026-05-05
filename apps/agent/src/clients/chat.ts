import type {
  AgentGetChatSessionContextRequest,
  AgentGetChatSessionContextResponse,
} from '@haohaoxue/samepage-contracts'
import {
  AgentGetChatSessionContextRequestSchema,
  AgentGetChatSessionContextResponseSchema,
} from '@haohaoxue/samepage-contracts'
import { normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface AgentChatApiClient {
  getSessionContext: (options: AgentGetChatSessionContextOptions) => Promise<AgentGetChatSessionContextResponse>
}

export interface AgentGetChatSessionContextOptions extends AgentGetChatSessionContextRequest {
  sessionId: string
}

export function createAgentChatApiClient(apiInternalUrl: string): AgentChatApiClient {
  const baseUrl = normalizeApiInternalBaseUrl(apiInternalUrl)

  return {
    async getSessionContext(options) {
      const payload = AgentGetChatSessionContextRequestSchema.parse({
        actorId: options.actorId,
        triggerMessageOrder: options.triggerMessageOrder,
      })

      return AgentGetChatSessionContextResponseSchema.parse(await postApiInternalJson({
        baseUrl,
        path: `internal/chat/sessions/${encodeURIComponent(options.sessionId)}/context`,
        payload,
        errorMessage: '读取聊天上下文失败',
      }))
    },
  }
}
