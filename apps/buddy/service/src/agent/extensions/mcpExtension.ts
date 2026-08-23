import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'

export interface CreateMcpExtensionOptions {
  tools: readonly ToolDefinition[]
}

export function createMcpExtension(
  options: CreateMcpExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-mcp',
    factory(pi) {
      for (const tool of options.tools)
        pi.registerTool(tool)
    },
  }
}
