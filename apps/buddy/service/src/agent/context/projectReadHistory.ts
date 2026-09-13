import type { ToolResultMessage } from '@earendil-works/pi-ai'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { isHistoricalBinaryRead, READ_CONTENT_NOTICE } from '../files/readFileContent'

export function projectReadResult(message: ToolResultMessage): ToolResultMessage {
  if (message.toolName !== 'read' || message.isError
    || !message.content.some(block => block.type === 'text' && isHistoricalBinaryRead(block.text))) {
    return message
  }
  return {
    ...message,
    content: message.content.map(block => block.type === 'text' && isHistoricalBinaryRead(block.text)
      ? { type: 'text', text: `Earlier raw file output was omitted from this request. ${READ_CONTENT_NOTICE}` }
      : block),
    details: undefined,
  }
}

export function projectReadHistory(messages: readonly AgentSession['messages'][number][]): AgentSession['messages'] {
  return messages.map(message => message.role === 'toolResult' ? projectReadResult(message) : message)
}
