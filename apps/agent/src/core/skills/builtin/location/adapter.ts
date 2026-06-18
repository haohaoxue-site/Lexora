import type { RuntimeSkillAdapter } from '../../adapter'
import {
  AGENT_LOCATION_SKILL_KEY,
  AGENT_LOCATION_TOOL_VALUES,
} from '@haohaoxue/lexora-contracts'
import { executeLocationToolCalls } from './executor'
import {
  createLocationSkillTools,
  isLocationSkillActive,
  isLocationToolCall,
} from './tools'

export function createLocationRuntimeSkillAdapter(): RuntimeSkillAdapter {
  return {
    key: AGENT_LOCATION_SKILL_KEY,
    toolNames: AGENT_LOCATION_TOOL_VALUES,
    isAvailable({ context }) {
      return isLocationSkillActive(context)
    },
    createTools() {
      return createLocationSkillTools()
    },
    isToolCall: isLocationToolCall,
    async executeToolCalls(input) {
      return executeLocationToolCalls({
        context: input.context,
        toolCalls: input.toolCalls,
      })
    },
  }
}
