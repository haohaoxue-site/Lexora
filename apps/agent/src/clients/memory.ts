import type {
  RetrieveAgentMemoryRequest,
  RetrieveAgentMemoryResponse,
} from '@haohaoxue/samepage-contracts'
import { RetrieveAgentMemoryResponseSchema } from '@haohaoxue/samepage-contracts'
import { normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface AgentMemoryApiClient {
  retrieveMemories: (payload: RetrieveAgentMemoryRequest) => Promise<RetrieveAgentMemoryResponse>
}

export function createAgentMemoryApiClient(apiInternalUrl: string): AgentMemoryApiClient {
  const baseUrl = normalizeApiInternalBaseUrl(apiInternalUrl)

  return {
    async retrieveMemories(payload) {
      return RetrieveAgentMemoryResponseSchema.parse(await postApiInternalJson({
        baseUrl,
        path: 'internal/agent/memory/retrieve',
        payload,
        errorMessage: '读取长期记忆失败',
      }))
    },
  }
}
