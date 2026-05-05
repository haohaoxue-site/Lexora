import type { AgentChatModelResponse } from './chat-model'

export function readChatModelResponseText(response: AgentChatModelResponse): string {
  const { content } = response

  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content.map(readContentBlockText).join('')
}

function readContentBlockText(block: unknown): string {
  if (typeof block === 'string') {
    return block
  }
  if (!isRecord(block)) {
    return ''
  }

  const text = block.text
  return typeof text === 'string' ? text : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
