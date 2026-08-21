import type { LocalMessage } from '../../electron/shared/localChatApi'
import { getChatMessageText, isVisibleChatMessage } from './chatMessageContent'

export interface ChatMessageSearchResult {
  messageId: string
}

export function projectChatMessageSearchResults(
  messages: ReadonlyArray<LocalMessage>,
  query: string,
): ChatMessageSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery)
    return []

  return messages
    .filter(message => isVisibleChatMessage(message)
      && getChatMessageText(message).toLocaleLowerCase().includes(normalizedQuery))
    .map(message => ({ messageId: message.id }))
}
