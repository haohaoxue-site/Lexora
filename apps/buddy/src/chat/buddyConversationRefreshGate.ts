export interface BuddyConversationRefreshGate {
  clear: () => void
  isCurrent: (conversationId: string, requestId: number) => boolean
  start: (conversationId: string) => number
}

export function createBuddyConversationRefreshGate(): BuddyConversationRefreshGate {
  const requestIdByConversationId = new Map<string, number>()

  function start(conversationId: string) {
    const requestId = (requestIdByConversationId.get(conversationId) ?? 0) + 1
    requestIdByConversationId.set(conversationId, requestId)

    return requestId
  }

  function isCurrent(conversationId: string, requestId: number) {
    return requestIdByConversationId.get(conversationId) === requestId
  }

  function clear() {
    requestIdByConversationId.clear()
  }

  return {
    clear,
    isCurrent,
    start,
  }
}
