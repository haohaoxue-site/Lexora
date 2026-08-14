import type { LocalMessage } from '../../electron/shared/localChatApi'

export interface ChatMessageActions {
  disabled: boolean
  showCopy: boolean
  showEdit: boolean
  showRegenerate: boolean
}

export function projectChatMessageActions(
  message: LocalMessage,
  disabled: boolean,
): ChatMessageActions {
  const lifecycleMessage = message.role === 'user' || message.role === 'assistant'
  return {
    disabled,
    showCopy: lifecycleMessage,
    showEdit: message.role === 'user',
    showRegenerate: message.role === 'assistant',
  }
}
