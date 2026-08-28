import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyToolPresentation } from '../../../../shared/runEventPresentation'
import type { BuddyToolClassification } from '../../approvals/toolClassification'
import type { CreateBuddyToolPresentationInput } from '../../events/toolPresentationSupport'

import {
  argumentNames,
  boundedToolPreview,
  readOptionalString,
  readRecord,
  readToolOutput,
} from '../../events/toolPresentationSupport'

const MCP_TOOL_PREFIX = 'mcp__'

export function classifyMcpTool(
  classifications: ReadonlyMap<string, BuddyToolClassification>,
  event: Pick<ToolCallEvent, 'toolName'>,
): BuddyToolClassification | null {
  return classifications.get(event.toolName) ?? null
}

export function createMcpToolPresentation(
  input: CreateBuddyToolPresentationInput,
): Extract<BuddyToolPresentation, { card: 'connector' }> | null {
  if (!input.toolName.startsWith(MCP_TOOL_PREFIX))
    return null
  const arguments_ = readRecord(input.arguments)
  const [, connector = 'connector', ...toolParts] = input.toolName.split('__')
  return {
    argumentNames: argumentNames(arguments_),
    card: 'connector',
    connector,
    description: readOptionalString(arguments_, 'description'),
    tool: toolParts.join('__') || input.toolName,
    ...boundedToolPreview(readToolOutput(input.result)),
  }
}
