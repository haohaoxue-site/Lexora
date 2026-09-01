import type { BuddyChatMessageListHandle, ChatMessageScrollMetrics } from '@/workbenches/chat/transcript/chatMessageViewport'
import { computed, nextTick, shallowRef, watch } from 'vue'
import {
  beginReturningToChatTail,
  createChatScrollState,
  detachChatScroll,
  observeChatScroll,
  recordProgrammaticChatScroll,
} from '@/workbenches/chat/workspace/chatScroll'

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
  timelineItems: ValueRef<ReadonlyArray<ChatViewportTimelineItem>>
}

interface RevealMessageOptions {
  behavior?: ScrollBehavior
  highlight?: boolean
}

export function useChatViewport(options: UseChatViewportOptions) {
  const scrollState = shallowRef(createChatScrollState())
  const isRestoringHistoryAnchor = shallowRef(false)
  const showReturnToLatest = computed(() => scrollState.value.ownership === 'detached')
  let revealGeneration = 0

  watch(
    () => [options.activeConversationId.value, options.activeBranchId.value],
    () => {
      scrollState.value = createChatScrollState()
      void scrollToTailAfterRender()
    },
  )
  watch(() => options.activeSearchMessageId.value, (messageId) => {
    if (messageId)
      void revealMessage(messageId, () => options.activeSearchMessageId.value === messageId)
  })
  watch(
    [
      () => options.isLoading.value,
      () => options.list.value,
    ],
    () => {
      if (scrollState.value.ownership === 'following')
        void scrollToTailAfterRender()
    },
  )

  function handleScroll(metrics: ChatMessageScrollMetrics) {
    scrollState.value = observeChatScroll(scrollState.value, metrics).state
    if (
      metrics.scrollTop <= 64
      && options.hasOlderMessages.value
      && !options.isLoadingOlderMessages.value
      && !isRestoringHistoryAnchor.value
    ) {
      void loadOlderMessagesWithAnchor()
    }
  }

  function handleContentResize(_metrics: ChatMessageScrollMetrics) {
    if (scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  function handleReaderLayoutIntent() {
    scrollState.value = detachChatScroll(scrollState.value)
  }

  async function returnToLatest() {
    scrollState.value = beginReturningToChatTail(scrollState.value)
    await nextTick()
    writeTailPosition()
  }

  async function scrollToTailAfterRender() {
    await nextTick()
    if (scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  function writeTailPosition() {
    const metrics = options.list.value?.scrollToTail()
    if (metrics)
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
  }

  async function loadOlderMessagesWithAnchor() {
    const list = options.list.value
    const anchor = list?.captureScrollAnchor()
    if (!list || !anchor)
      return
    scrollState.value = detachChatScroll(scrollState.value)
    const loaded = await options.loadOlderMessages()
    if (!loaded)
      return
    isRestoringHistoryAnchor.value = true
    try {
      await nextTick()
      const metrics = list.restoreScrollAnchor(anchor)
      if (metrics)
        scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
    }
    finally {
      isRestoringHistoryAnchor.value = false
    }
  }

  async function revealMessage(
    messageId: string,
    isCurrent: () => boolean = () => true,
    revealOptions: RevealMessageOptions = {},
  ) {
    const generation = ++revealGeneration
    let needsOlderMessages = shouldLoadOlderMessage(messageId, generation)
    while (needsOlderMessages) {
      const loaded = await options.loadOlderMessages()
      if (!loaded)
        break
      needsOlderMessages = shouldLoadOlderMessage(messageId, generation)
    }
    if (generation !== revealGeneration || !isCurrent()) {
      return
    }
    await nextTick()
    scrollState.value = detachChatScroll(scrollState.value)
    if (revealOptions.highlight)
      options.list.value?.highlightMessage(messageId)
    const metrics = options.list.value?.scrollToMessage(messageId, revealOptions.behavior)
    if (metrics)
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
  }

  function revealOutlineMessage(messageId: string) {
    return revealMessage(messageId, () => true, {
      behavior: 'smooth',
      highlight: true,
    })
  }

  function shouldLoadOlderMessage(messageId: string, generation: number) {
    return generation === revealGeneration
      && options.hasOlderMessages.value
      && !options.timelineItems.value.some(
        item => item.kind === 'message' && item.id === messageId,
      )
  }

  return {
    handleContentResize,
    handleReaderLayoutIntent,
    handleScroll,
    revealOutlineMessage,
    revealMessage,
    returnToLatest,
    showReturnToLatest,
  }
}
