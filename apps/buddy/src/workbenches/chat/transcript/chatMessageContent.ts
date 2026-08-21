import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import { readBuddyInterruptedMessageContent } from '@buddy-shared/buddyMessageContent'

export interface ChatMessageInterruption {
  truncated: boolean
}

export function getChatMessageInterruption(
  message: LocalMessage,
): ChatMessageInterruption | null {
  if (message.role !== 'assistant')
    return null
  const content = readBuddyInterruptedMessageContent(message.content)
  return content ? { truncated: content.truncated } : null
}

export function getChatMessageText(message: LocalMessage): string {
  if (typeof message.content === 'string')
    return message.content
  if (!message.content || typeof message.content !== 'object' || Array.isArray(message.content))
    return ''
  const text = (message.content as Record<string, unknown>).text
  return typeof text === 'string' ? text : ''
}

export function isVisibleChatMessage(message: LocalMessage): boolean {
  return message.role !== 'tool'
    && (getChatMessageText(message).trim().length > 0 || message.attachments.length > 0)
}
