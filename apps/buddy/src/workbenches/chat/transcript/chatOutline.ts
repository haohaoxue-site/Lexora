import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import { getChatMessageText, isVisibleChatMessage } from './chatMessageContent'

const CHAT_OUTLINE_SNIPPET_LENGTH = 120

export interface ChatOutlineItem {
  attachmentOnly: boolean
  kind: 'input' | 'output'
  messageId: string
  text: string
}

export function projectChatOutlineItems(
  messages: ReadonlyArray<LocalMessage>,
): ChatOutlineItem[] {
  const items: ChatOutlineItem[] = []
  const outputIndexByRunId = new Map<string, number>()

  for (const message of messages) {
    if (!isVisibleChatMessage(message) || message.role === 'tool')
      continue

    const item = toOutlineItem(message)
    if (item.kind === 'output' && message.runId) {
      const outputIndex = outputIndexByRunId.get(message.runId)
      if (outputIndex !== undefined) {
        items[outputIndex] = item
        continue
      }
      outputIndexByRunId.set(message.runId, items.length)
      items.push(item)
      continue
    }
    items.push(item)
  }

  return items
}

export function mergeChatOutlineMessages(
  loadedMessages: ReadonlyArray<LocalMessage>,
  currentMessages: ReadonlyArray<LocalMessage>,
): LocalMessage[] {
  const currentById = new Map(currentMessages.map(message => [message.id, message]))
  const loadedIds = new Set(loadedMessages.map(message => message.id))

  return [
    ...loadedMessages.map(message => currentById.get(message.id) ?? message),
    ...currentMessages.filter(message => !loadedIds.has(message.id)),
  ]
}

function toOutlineItem(message: LocalMessage): ChatOutlineItem {
  const text = getChatMessageText(message).replace(/\s+/g, ' ').trim()

  return {
    attachmentOnly: text.length === 0,
    kind: message.role === 'user' ? 'input' : 'output',
    messageId: message.id,
    text: text.length > CHAT_OUTLINE_SNIPPET_LENGTH
      ? `${text.slice(0, CHAT_OUTLINE_SNIPPET_LENGTH).trimEnd()}…`
      : text,
  }
}
