import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyToolPresentation } from '../../../../shared/runs/runEventPresentation'
import type { BuddyToolClassification } from '../../approvals/toolClassification'
import type { CreateBuddyToolPresentationInput } from '../../events/toolPresentationSupport'

import {
  argumentNames,
  boundedToolPreview,
  readOptionalString,
  readRecord,
  readToolDetails,
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
  const details = readToolDetails(input.result)
  const [, connector = 'connector', ...toolParts] = input.toolName.split('__')
  return {
    argumentNames: argumentNames(arguments_),
    card: 'connector',
    connector: readOptionalString(details, 'connector') ?? connector,
    description: readOptionalString(arguments_, 'description'),
    tool: readOptionalString(details, 'connectorTool') ?? (toolParts.join('__') || input.toolName),
    ...boundedToolPreview(readToolOutput(input.result)),
  }
}

export function createMcpRunOutput(input: CreateBuddyToolPresentationInput & { toolCallId: string }) {
  if (!input.toolName.startsWith(MCP_TOOL_PREFIX) || input.isError)
    return null
  const details = readToolDetails(input.result)
  const artifactIds = Array.isArray(details?.artifactIds)
    ? details.artifactIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256).slice(0, 128)
    : []
  return artifactIds.length ? { artifactIds, sourceToolCallId: input.toolCallId, sourceToolName: input.toolName } : null
}
