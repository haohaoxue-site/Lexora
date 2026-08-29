import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { ChatAgentTurn } from './chatStreamingMessage'

export interface ChatMessageActions {
  disabled: boolean
  showCopy: boolean
  showEdit: boolean
  showRegenerate: boolean
  showTime: boolean
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
    showRegenerate: message.role === 'assistant' && message.runId !== null,
    showTime: lifecycleMessage,
  }
}

export function projectChatAgentTurnActions(
  turn: ChatAgentTurn,
  disabled: boolean,
  ownsResultActions: boolean,
): ChatMessageActions {
  const showActions = ownsResultActions
    && (turn.status === 'failed' || turn.status === 'cancelled')
  return {
    disabled,
    showCopy: showActions,
    showEdit: false,
    showRegenerate: showActions,
    showTime: showActions,
  }
}
