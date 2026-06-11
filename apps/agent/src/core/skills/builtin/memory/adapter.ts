import type { RuntimeSkillAdapter } from '../../adapter'
import { AGENT_MEMORY_SKILL_KEY } from '@haohaoxue/samepage-contracts'
import {
  executeMemoryToolCalls,
} from './executor'
import {
  createMemorySkillTools,
  isMemorySkillActive,
  isMemoryToolCall,
} from './tools'

export function createMemoryRuntimeSkillAdapter(): RuntimeSkillAdapter {
  return {
    key: AGENT_MEMORY_SKILL_KEY,
    isAvailable({ context, services }) {
      return Boolean(services.memoryApi && isMemorySkillActive(context))
    },
    createTools() {
      return createMemorySkillTools()
    },
    isToolCall: isMemoryToolCall,
    async executeToolCalls(input) {
      if (!input.services.memoryApi) {
        return {
          toolMessages: [],
          memoryOperations: [],
        }
      }

      const result = await executeMemoryToolCalls({
        memoryApi: input.services.memoryApi,
        context: input.context,
        sessionId: input.sessionId,
        toolCalls: input.toolCalls,
      })

      return {
        toolMessages: result.toolMessages,
        memoryOperations: result.operations,
      }
    },
  }
}
