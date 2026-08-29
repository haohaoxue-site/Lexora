import type { ChatMessageScrollMetrics } from '@/workbenches/chat/transcript/chatMessageViewport'

import { isNearChatTail } from '@/workbenches/chat/transcript/chatMessageViewport'

export {
  isNearChatTail,
  resolvePrependedChatScrollTop,
} from '@/workbenches/chat/transcript/chatMessageViewport'

export type ChatScrollOwnership = 'detached' | 'following' | 'returning'

export interface ChatScrollState {
  observedTop: number
  ownership: ChatScrollOwnership
}

export interface ObservedChatScroll {
  movedByReader: boolean
  state: ChatScrollState
}

const CHAT_SCROLL_POSITION_EPSILON_PX = 0.5

export function createChatScrollState(): ChatScrollState {
  return {
    observedTop: 0,
    ownership: 'following',
  }
}

export function beginReturningToChatTail(state: ChatScrollState): ChatScrollState {
  return {
    ...state,
    ownership: 'returning',
  }
}

export function detachChatScroll(state: ChatScrollState): ChatScrollState {
  return {
    ...state,
    ownership: 'detached',
  }
}

export function observeChatScroll(
  state: ChatScrollState,
  metrics: ChatMessageScrollMetrics,
): ObservedChatScroll {
  const floor = Math.max(0, metrics.scrollHeight - metrics.clientHeight)
  const expectedTop = Math.min(state.observedTop, floor)
  const movedByReader = Math.abs(metrics.scrollTop - expectedTop)
    > CHAT_SCROLL_POSITION_EPSILON_PX
  const ownership = movedByReader
    ? isNearChatTail(metrics) ? 'following' : 'detached'
    : state.ownership

  return {
    movedByReader,
    state: {
      observedTop: metrics.scrollTop,
      ownership,
    },
  }
}

export function recordProgrammaticChatScroll(
  state: ChatScrollState,
  metrics: ChatMessageScrollMetrics,
): ChatScrollState {
  return {
    observedTop: metrics.scrollTop,
    ownership: state.ownership === 'returning' && isNearChatTail(metrics)
      ? 'following'
      : state.ownership,
  }
}
