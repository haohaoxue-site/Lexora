export interface ChatMessageScrollMetrics {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

export interface ChatMessageScrollAnchor {
  messageId: string
  messageOffsetTop: number
  metrics: ChatMessageScrollMetrics
}

export interface BuddyChatMessageListHandle {
  captureScrollAnchor: () => ChatMessageScrollAnchor | null
  readScrollMetrics: () => ChatMessageScrollMetrics | null
  restoreScrollAnchor: (anchor: ChatMessageScrollAnchor) => ChatMessageScrollMetrics | null
  scrollToMessage: (messageId: string) => ChatMessageScrollMetrics | null
  scrollToTail: () => ChatMessageScrollMetrics | null
}

const CHAT_TAIL_TOLERANCE_PX = 48

export function isNearChatTail(metrics: ChatMessageScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= CHAT_TAIL_TOLERANCE_PX
}

export function resolvePrependedChatScrollTop(
  anchor: ChatMessageScrollMetrics,
  current: ChatMessageScrollMetrics,
): number {
  const nextTop = anchor.scrollTop + current.scrollHeight - anchor.scrollHeight
  return Math.min(Math.max(0, nextTop), Math.max(0, current.scrollHeight - current.clientHeight))
}
