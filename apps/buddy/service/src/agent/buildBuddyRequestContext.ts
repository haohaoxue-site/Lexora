import type { Context } from '@earendil-works/pi-ai'
import type { ToolInfo } from '@earendil-works/pi-coding-agent'

export function buildBuddyRequestContext(context: Context, definitions: readonly ToolInfo[]): Context {
  const active = new Set(context.tools?.map(tool => tool.name) ?? [])
  const guidelines = [...new Set(definitions.flatMap(tool => active.has(tool.name) && !tool.name.startsWith('mcp__')
    ? tool.promptGuidelines ?? []
    : []).map(value => value.trim()).filter(Boolean))]
  return {
    ...context,
    systemPrompt: [
      context.systemPrompt ?? '',
      ...(guidelines.length > 0 ? [`Active tool guidelines:\n${guidelines.map(value => `- ${value}`).join('\n')}`] : []),
    ].join('\n\n'),
  }
}
