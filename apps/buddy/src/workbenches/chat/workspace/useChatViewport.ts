import type { BuddyChatMessageListHandle, ChatMessageScrollMetrics } from '@/workbenches/chat/transcript/chatMessageViewport'
import { nextTick, shallowRef, watch } from 'vue'
import { isNearChatTail } from '@/workbenches/chat/workspace/chatScroll'

interface ValueRef<T> {
  readonly value: T
}

interface ChatViewportTimelineItem {
  id: string
  kind: string
}

interface UseChatViewportOptions {
  activeBranchId: ValueRef<string | null>
  activeConversationId: ValueRef<string | null>
  activeSearchMessageId: ValueRef<string | null>
  hasOlderMessages: ValueRef<boolean>
  isLoading: ValueRef<boolean>
  isLoadingOlderMessages: ValueRef<boolean>
  list: ValueRef<BuddyChatMessageListHandle | null>
  loadOlderMessages: () => Promise<boolean>
  runEventCount: ValueRef<number>
  timelineItems: ValueRef<ReadonlyArray<ChatViewportTimelineItem>>
}

export function useChatViewport(options: UseChatViewportOptions) {
  const followsChatTail = shallowRef(true)
  const isRestoringHistoryAnchor = shallowRef(false)
  let searchRevealGeneration = 0

  watch(
    () => [options.activeConversationId.value, options.activeBranchId.value],
    () => {
      followsChatTail.value = true
      void scrollToTailAfterRender()
    },
  )
  watch(() => options.activeSearchMessageId.value, (messageId) => {
    if (messageId)
      void revealSearchMessage(messageId)
  })
  watch(
    [
      () => options.isLoading.value,
      () => options.timelineItems.value.length,
      () => options.runEventCount.value,
    ],
    () => {
      if (followsChatTail.value)
        void scrollToTailAfterRender()
    },
  )

  function handlePosition(metrics: ChatMessageScrollMetrics, tailScrollSettling: boolean) {
    const tailDistance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
    if (tailScrollSettling && tailDistance <= metrics.clientHeight * 2) {
      followsChatTail.value = true
      return
    }
    followsChatTail.value = isNearChatTail(metrics)
    if (!followsChatTail.value)
      options.list.value?.cancelTailScroll()
  }

  function handleScroll(metrics: ChatMessageScrollMetrics, tailScrollSettling: boolean) {
    handlePosition(metrics, tailScrollSettling)
    if (
      metrics.scrollTop <= 64
      && options.hasOlderMessages.value
      && !options.isLoadingOlderMessages.value
      && !isRestoringHistoryAnchor.value
    ) {
      void loadOlderMessagesWithAnchor()
    }
  }

  async function scrollToTailAfterRender() {
    await nextTick()
    await options.list.value?.scrollToTail()
  }

  async function loadOlderMessagesWithAnchor() {
    const list = options.list.value
    const anchor = list?.captureScrollAnchor()
    if (!list || !anchor)
      return
    const loaded = await options.loadOlderMessages()
    if (!loaded)
      return
    isRestoringHistoryAnchor.value = true
    followsChatTail.value = false
    try {
      await nextTick()
      await list.restoreScrollAnchor(anchor)
    }
    finally {
      isRestoringHistoryAnchor.value = false
    }
  }

  async function revealSearchMessage(messageId: string) {
    const generation = ++searchRevealGeneration
    let needsOlderMessages = shouldLoadOlderSearchMessage(messageId, generation)
    while (needsOlderMessages) {
      const loaded = await options.loadOlderMessages()
      if (!loaded)
        break
      needsOlderMessages = shouldLoadOlderSearchMessage(messageId, generation)
    }
    if (
      generation !== searchRevealGeneration
      || options.activeSearchMessageId.value !== messageId
    ) {
      return
    }
    await nextTick()
    await options.list.value?.scrollToMessage(messageId)
  }

  function shouldLoadOlderSearchMessage(messageId: string, generation: number) {
    return generation === searchRevealGeneration
      && options.hasOlderMessages.value
      && !options.timelineItems.value.some(
        item => item.kind === 'message' && item.id === messageId,
      )
  }

  return {
    handlePosition,
    handleScroll,
  }
}
