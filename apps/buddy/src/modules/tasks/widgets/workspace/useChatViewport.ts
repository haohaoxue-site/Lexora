import type { BuddyChatMessageListHandle, ChatMessageScrollMetrics } from '@/modules/tasks/widgets/transcript/chatMessageViewport'
import { computed, nextTick, onScopeDispose, shallowRef, watch } from 'vue'
import {
  beginReturningToChatTail,
  createChatScrollState,
  detachChatScroll,
  observeChatScroll,
  recordProgrammaticChatScroll,
} from '@/modules/tasks/widgets/workspace/chatScroll'

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

interface ScrollOperation {
  generation: number
  list: BuddyChatMessageListHandle | null
}

export function useChatViewport(options: UseChatViewportOptions) {
  const scrollState = shallowRef(createChatScrollState())
  const showReturnToLatest = computed(() => scrollState.value.ownership === 'detached')
  let operationGeneration = 0
  let pendingHistory: ScrollOperation | null = null
  let pendingPage: Promise<boolean> | null = null
  let pendingSearchMessageId: string | null = null
  let disposed = false

  watch(
    [
      () => options.activeConversationId.value,
      () => options.activeBranchId.value,
      () => options.list.value,
    ],
    ([conversationId, branchId], [previousConversationId, previousBranchId]) => {
      operationGeneration += 1
      pendingHistory = null
      pendingPage = null
      const contextChanged = conversationId !== previousConversationId || branchId !== previousBranchId
      if (contextChanged)
        pendingSearchMessageId = null
      scrollState.value = !contextChanged && scrollState.value.ownership === 'detached'
        ? detachChatScroll(createChatScrollState())
        : createChatScrollState()
      if (!resumePendingSearch() && scrollState.value.ownership === 'following')
        void scrollToTailAfterRender()
    },
    { flush: 'sync' },
  )
  watch(() => options.activeSearchMessageId.value, (messageId) => {
    operationGeneration += 1
    pendingSearchMessageId = messageId
    resumePendingSearch()
  }, { flush: 'sync', immediate: true })
  watch(() => options.isLoading.value, () => {
    if (!resumePendingSearch() && scrollState.value.ownership === 'following')
      void scrollToTailAfterRender()
  })
  onScopeDispose(() => {
    disposed = true
    operationGeneration += 1
    pendingHistory = null
    pendingPage = null
    pendingSearchMessageId = null
  })

  function resumePendingSearch(): boolean {
    const messageId = pendingSearchMessageId
    if (!messageId || disposed)
      return false
    scrollState.value = detachChatScroll(scrollState.value)
    if (!options.list.value || options.isLoading.value)
      return true
    const revealing = revealMessage(messageId, () => pendingSearchMessageId === messageId)
    const generation = operationGeneration
    void revealing.then(() => {
      if (generation === operationGeneration)
        pendingSearchMessageId = null
    })
    return true
  }

  function beginOperation(): ScrollOperation {
    return { generation: ++operationGeneration, list: options.list.value }
  }

  function isCurrent(operation: ScrollOperation): boolean {
    return !disposed
      && operation.generation === operationGeneration
      && operation.list === options.list.value
  }

  function handleScroll(metrics: ChatMessageScrollMetrics) {
    if (disposed)
      return
    const observation = observeChatScroll(scrollState.value, metrics)
    scrollState.value = observation.state
    if (observation.movedByReader) {
      operationGeneration += 1
      pendingSearchMessageId = null
    }
    if (
      metrics.scrollTop <= 64
      && options.hasOlderMessages.value
      && !options.isLoadingOlderMessages.value
      && pendingHistory === null
    ) {
      void loadOlderMessagesWithAnchor()
    }
  }

  function handleContentResize(_metrics: ChatMessageScrollMetrics) {
    if (!disposed && scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  function handleReaderLayoutIntent() {
    if (disposed)
      return
    operationGeneration += 1
    pendingSearchMessageId = null
    scrollState.value = detachChatScroll(scrollState.value)
  }

  async function returnToLatest() {
    if (disposed)
      return
    pendingSearchMessageId = null
    const operation = beginOperation()
    scrollState.value = beginReturningToChatTail(scrollState.value)
    await nextTick()
    if (isCurrent(operation) && scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  async function scrollToTailAfterRender() {
    const operation = beginOperation()
    await nextTick()
    if (isCurrent(operation) && scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  function writeTailPosition() {
    const metrics = options.list.value?.scrollToTail()
    if (metrics)
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
  }

  function loadOlderPage(): Promise<boolean> {
    if (pendingPage)
      return pendingPage
    const request = options.loadOlderMessages()
    pendingPage = request
    void request.then(clearPendingPage, clearPendingPage)
    return request

    function clearPendingPage() {
      if (pendingPage === request)
        pendingPage = null
    }
  }

  async function loadOlderMessagesWithAnchor() {
    const list = options.list.value
    const anchor = list?.captureScrollAnchor()
    if (!list || !anchor)
      return
    const operation = beginOperation()
    pendingHistory = operation
    scrollState.value = detachChatScroll(scrollState.value)
    try {
      const loaded = await loadOlderPage()
      if (!loaded || !isCurrent(operation))
        return
      await nextTick()
      if (!isCurrent(operation))
        return
      const metrics = list.restoreScrollAnchor(anchor)
      if (metrics)
        scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
    }
    catch {}
    finally {
      if (pendingHistory === operation)
        pendingHistory = null
    }
  }

  async function revealMessage(
    messageId: string,
    isRequested: () => boolean = () => true,
    revealOptions: RevealMessageOptions = {},
  ) {
    if (disposed)
      return
    const operation = beginOperation()
    scrollState.value = detachChatScroll(scrollState.value)
    const isActive = () => isCurrent(operation) && isRequested()
    try {
      while (isActive() && shouldLoadOlderMessage(messageId)) {
        const loaded = await loadOlderPage()
        if (!loaded)
          break
      }
    }
    catch {
      return
    }
    if (!isActive())
      return
    await nextTick()
    if (!isActive())
      return
    if (revealOptions.highlight)
      operation.list?.highlightMessage(messageId)
    const metrics = operation.list?.scrollToMessage(messageId, revealOptions.behavior)
    if (metrics)
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
  }

  function revealOutlineMessage(messageId: string) {
    pendingSearchMessageId = null
    return revealMessage(messageId, () => true, {
      behavior: 'smooth',
      highlight: true,
    })
  }

  function shouldLoadOlderMessage(messageId: string) {
    return options.hasOlderMessages.value
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
