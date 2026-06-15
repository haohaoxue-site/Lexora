import type { ToolCall } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentGraphContext } from '../../../state'
import {
  AGENT_WEB_SEARCH_SKILL_KEY,
  AGENT_WEB_SEARCH_TOOL,
  AgentWebSearchSkillConfigSchema,
} from '@haohaoxue/lexora-contracts'
import { tool } from '@langchain/core/tools'
import { WebSearchToolInputSchema } from './schemas'

export function isWebSearchSkillActive(context: AgentGraphContext | undefined): boolean {
  if (context?.disabledSkillKeys?.includes(AGENT_WEB_SEARCH_SKILL_KEY)) {
    return false
  }

  const config = context?.agentProfileConfig
  if (!config?.toolPolicy.enabled) {
    return false
  }

  return config.skillBindings.some(binding =>
    binding.key === AGENT_WEB_SEARCH_SKILL_KEY && binding.enabled,
  )
}

export function createWebSearchSkillTools(): StructuredToolInterface[] {
  return [
    tool(async () => 'web search request received', {
      name: AGENT_WEB_SEARCH_TOOL.SEARCH,
      description: [
        'Search the public web for current or externally verifiable information.',
        'Use for latest facts, recent events, source verification, product/vendor changes, or questions that require URLs.',
        'Do not use for private Lexora documents, local files, or stable reasoning that does not need external sources.',
      ].join(' '),
      schema: WebSearchToolInputSchema,
    }),
  ]
}

export function isWebSearchToolCall(toolCall: ToolCall): boolean {
  return toolCall.name === AGENT_WEB_SEARCH_TOOL.SEARCH
}

export function resolveWebSearchSkillConfig(context: AgentGraphContext) {
  const binding = context.agentProfileConfig?.skillBindings.find(item => item.key === AGENT_WEB_SEARCH_SKILL_KEY)
  return AgentWebSearchSkillConfigSchema.parse(binding?.config ?? {})
}
