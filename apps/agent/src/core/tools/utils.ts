import type { ToolCall } from '@langchain/core/messages'

export type BaseToolCall = ToolCall

export function getToolCallId(toolCall: BaseToolCall): string {
  return toolCall.id ?? `${toolCall.name}:missing-id`
}

export function stringifyToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

export function formatToolExecutionError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Tool execution failed.'
}
