import type {
  AgentEditorAiContext,
  AgentGetEditorAiContextRequest,
} from '@haohaoxue/samepage-contracts'
import {
  AgentEditorAiContextSchema,
  AgentGetEditorAiContextRequestSchema,
} from '@haohaoxue/samepage-contracts'
import { normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface AgentEditorApiClient {
  getEditorAiContext: (options: AgentGetEditorAiContextOptions) => Promise<AgentEditorAiContext>
}

export interface AgentGetEditorAiContextOptions extends AgentGetEditorAiContextRequest {
  sessionId: string
}

export function createAgentEditorApiClient(apiInternalUrl: string): AgentEditorApiClient {
  const baseUrl = normalizeApiInternalBaseUrl(apiInternalUrl)

  return {
    async getEditorAiContext(options) {
      const payload = AgentGetEditorAiContextRequestSchema.parse({
        actorId: options.actorId,
        aiRunId: options.aiRunId,
      })

      return AgentEditorAiContextSchema.parse(await postApiInternalJson({
        baseUrl,
        path: `internal/ai/editor/sessions/${encodeURIComponent(options.sessionId)}/context`,
        payload,
        errorMessage: '读取编辑器 AI 上下文失败',
      }))
    },
  }
}
