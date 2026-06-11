import type {
  ActivateAgentSkillRequest,
  ActivateAgentSkillResponse,
  ReadAgentSkillResourceRequest,
  ReadAgentSkillResourceResponse,
} from '@haohaoxue/samepage-contracts'
import {
  ActivateAgentSkillResponseSchema,
  ReadAgentSkillResourceResponseSchema,
} from '@haohaoxue/samepage-contracts'
import { normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface AgentSkillApiClient {
  activateSkill: (payload: ActivateAgentSkillRequest) => Promise<ActivateAgentSkillResponse>
  readSkillResource: (payload: ReadAgentSkillResourceRequest) => Promise<ReadAgentSkillResourceResponse>
}

export function createAgentSkillApiClient(apiInternalUrl: string): AgentSkillApiClient {
  const baseUrl = normalizeApiInternalBaseUrl(apiInternalUrl)

  return {
    async activateSkill(payload) {
      return ActivateAgentSkillResponseSchema.parse(await postApiInternalJson({
        baseUrl,
        path: 'internal/agent/skills/activate',
        payload,
        errorMessage: '激活技能失败',
      }))
    },

    async readSkillResource(payload) {
      return ReadAgentSkillResourceResponseSchema.parse(await postApiInternalJson({
        baseUrl,
        path: 'internal/agent/skills/resources/read',
        payload,
        errorMessage: '读取技能资源失败',
      }))
    },
  }
}
