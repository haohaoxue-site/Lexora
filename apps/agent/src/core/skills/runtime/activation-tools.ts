import type { ToolCall } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { AGENT_SKILL_TOOL_NAME } from './tool-names'

export const ActivateSkillToolSchema = z.object({
  skillKey: z.string().trim().min(1).describe('Exact skill key from the available_skills catalog.'),
}).strict()

export const ReadSkillResourceToolSchema = z.object({
  skillKey: z.string().trim().min(1).describe('Exact skill key that has already been activated.'),
  path: z.string().trim().min(1).describe('Relative resource path inside the skill package.'),
}).strict()

export function createAgentSkillTools(): StructuredToolInterface[] {
  return [
    tool(async () => 'skill activation requested', {
      name: AGENT_SKILL_TOOL_NAME.ACTIVATE,
      description: 'Load the full instructions for a named Lexora Agent Skill before following that skill workflow.',
      schema: ActivateSkillToolSchema,
    }),
    tool(async () => 'skill resource requested', {
      name: AGENT_SKILL_TOOL_NAME.READ_RESOURCE,
      description: 'Read a supporting file from an already activated skill package, such as references, examples, templates, or schemas.',
      schema: ReadSkillResourceToolSchema,
    }),
  ]
}

export function isAgentSkillToolCall(toolCall: ToolCall): boolean {
  return toolCall.name === AGENT_SKILL_TOOL_NAME.ACTIVATE
    || toolCall.name === AGENT_SKILL_TOOL_NAME.READ_RESOURCE
}
