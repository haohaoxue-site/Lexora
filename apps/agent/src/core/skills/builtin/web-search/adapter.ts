import type { RuntimeSkillAdapter } from '../../adapter'
import { AGENT_WEB_SEARCH_SKILL_KEY } from '@haohaoxue/lexora-contracts'
import { executeWebSearchToolCalls } from './executor'
import {
  createWebSearchSkillTools,
  isWebSearchSkillActive,
  isWebSearchToolCall,
} from './tools'

export function createWebSearchRuntimeSkillAdapter(): RuntimeSkillAdapter {
  return {
    key: AGENT_WEB_SEARCH_SKILL_KEY,
    isAvailable({ context, services }) {
      return Boolean(services.webSearch && isWebSearchSkillActive(context))
    },
    createTools() {
      return createWebSearchSkillTools()
    },
    isToolCall: isWebSearchToolCall,
    async executeToolCalls(input) {
      if (!input.services.webSearch) {
        return {
          toolMessages: [],
        }
      }

      return executeWebSearchToolCalls({
        context: input.context,
        webSearch: input.services.webSearch,
        toolCalls: input.toolCalls,
      })
    },
  }
}
