import type { RuntimeSkillAdapter } from '../../adapter'
import {
  AGENT_TIME_SKILL_KEY,
  AGENT_TIME_TOOL_VALUES,
} from '@haohaoxue/lexora-contracts'
import { executeTimeToolCalls } from './executor'
import {
  createTimeSkillTools,
  isTimeSkillActive,
  isTimeToolCall,
} from './tools'

export function createTimeRuntimeSkillAdapter(): RuntimeSkillAdapter {
  return {
    key: AGENT_TIME_SKILL_KEY,
    toolNames: AGENT_TIME_TOOL_VALUES,
    isAvailable({ context }) {
      return isTimeSkillActive(context)
    },
    createTools() {
      return createTimeSkillTools()
    },
    isToolCall: isTimeToolCall,
    async executeToolCalls(input) {
      return executeTimeToolCalls({
        context: input.context,
        toolCalls: input.toolCalls,
      })
    },
  }
}
