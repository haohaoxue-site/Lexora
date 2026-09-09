import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { BuddyCapability } from '../../agent/extensions/BuddyCapability'
import type { BuddyInProcessExtension } from '../../agent/extensions/BuddyInProcessExtension'
import type { BuddyMcpTools } from './McpConnectorService'
import { classifyMcpTool } from './mcpToolContract'

export function createMcpCapability(mcp: BuddyMcpTools): BuddyCapability {
  return {
    extension: createMcpExtension({ tools: mcp.tools }),
    classify: event => classifyMcpTool(mcp.classifications, event),
    disclosure: {
      group: 'mcp',
      keywords: 'mcp connector connected service 连接器 已连接 服务',
      toolNames: mcp.tools.map(tool => tool.name),
    },
  }
}

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
