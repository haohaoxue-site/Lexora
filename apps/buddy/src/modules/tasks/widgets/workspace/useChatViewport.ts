import type { BuddyChatMessageListHandle, ChatMessageScrollAnchor, ChatMessageScrollMetrics } from '@/modules/tasks/widgets/transcript/chatMessageViewport'
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
  const isPositioning = shallowRef(false)
  const showReturnToLatest = computed(() => scrollState.value.ownership === 'detached')
  const readingPositions = new Map<string, ChatMessageScrollAnchor | null>()
  const scopeKey = () => `${options.activeConversationId.value}:${options.activeBranchId.value}`
  let positionedScopeKey = scopeKey()
  let readingAnchor: ChatMessageScrollAnchor | null = null
  let pendingPosition: ChatMessageScrollAnchor | null = null
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
    ([conversationId, branchId], [previousConversationId, previousBranchId, previousList]) => {
      const contextChanged = conversationId !== previousConversationId || branchId !== previousBranchId
      if (contextChanged && !isPositioning.value) {
        readingPositions.delete(positionedScopeKey)
        readingPositions.set(positionedScopeKey, scrollState.value.ownership === 'detached'
          ? previousList?.captureScrollAnchor() ?? readingAnchor
          : null)
        if (readingPositions.size > 20)
          readingPositions.delete(readingPositions.keys().next().value!)
      }
      operationGeneration += 1
      pendingHistory = null
      pendingPage = null
      if (contextChanged)
        pendingSearchMessageId = null
      readingAnchor = null
      if (contextChanged)
        pendingPosition = readingPositions.get(scopeKey()) ?? null
      scrollState.value = !contextChanged && scrollState.value.ownership === 'detached'
        ? detachChatScroll(createChatScrollState())
        : createChatScrollState()
      isPositioning.value = Boolean(conversationId && branchId)
      if (!resumePendingSearch())
        void scrollToTailAfterRender()
    },
    { flush: 'sync' },
  )
  watch(() => options.activeSearchMessageId.value, (messageId) => {
    operationGeneration += 1
    pendingSearchMessageId = messageId
    if (!resumePendingSearch() && isPositioning.value)
      void scrollToTailAfterRender()
  }, { flush: 'sync', immediate: true })
  watch(() => options.isLoading.value, () => {
    if (!resumePendingSearch() && (isPositioning.value || scrollState.value.ownership === 'following'))
      void scrollToTailAfterRender()
  })
  watch(() => options.timelineItems.value, (items, previous) => {
    if (isPositioning.value || options.isLoading.value || scrollState.value.ownership !== 'detached')
      return
    const first = previous[0]
    if (!first || items[0]?.id === first.id
      || !items.some(item => item.id === first.id && item.kind === first.kind)) {
      return
    }
    const anchor = options.list.value?.captureScrollAnchor()
    if (!anchor)
      return
    const operation = { generation: operationGeneration, list: options.list.value }
    void nextTick(() => {
      if (!isCurrent(operation))
        return
      readingAnchor = anchor
      restoreReadingPosition()
    })
  }, { flush: 'pre' })
  onScopeDispose(() => {
    disposed = true
    operationGeneration += 1
    pendingHistory = null
    pendingPage = null
    pendingSearchMessageId = null
    readingPositions.clear()
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
    if (disposed || isPositioning.value)
      return
    const observation = observeChatScroll(scrollState.value, metrics)
    scrollState.value = observation.state
    if (observation.movedByReader) {
      operationGeneration += 1
      pendingSearchMessageId = null
    }
    readingAnchor = scrollState.value.ownership === 'detached'
      ? options.list.value?.captureScrollAnchor() ?? null
      : null
    if (
      metrics.scrollTop <= Math.max(64, metrics.clientHeight)
      && !options.isLoading.value
      && observation.movedByReader
      && options.hasOlderMessages.value
      && !options.isLoadingOlderMessages.value
      && pendingHistory === null
    ) {
      void loadOlderHistory()
    }
  }

  function handleContentResize(_metrics: ChatMessageScrollMetrics) {
    if (disposed || options.isLoading.value || isPositioning.value)
      return
    if (scrollState.value.ownership === 'detached')
      restoreReadingPosition()
    else writeTailPosition()
  }

  function restoreReadingPosition() {
    const metrics = readingAnchor && options.list.value?.restoreScrollAnchor(readingAnchor)
    if (metrics)
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
  }

  function handleReaderLayoutIntent() {
    if (disposed)
      return
    operationGeneration += 1
    pendingSearchMessageId = null
    readingAnchor = null
    pendingPosition = null
    scrollState.value = detachChatScroll(scrollState.value)
  }

  async function returnToLatest() {
    if (disposed)
      return
    pendingSearchMessageId = null
    readingAnchor = null
    pendingPosition = null
    const operation = beginOperation()
    scrollState.value = beginReturningToChatTail(scrollState.value)
    await nextTick()
    if (isCurrent(operation) && scrollState.value.ownership !== 'detached')
      writeTailPosition()
  }

  async function scrollToTailAfterRender() {
    if (options.isLoading.value || !options.list.value)
      return
    const operation = beginOperation()
    await nextTick()
    while (isCurrent(operation) && !options.isLoading.value && options.hasOlderMessages.value) {
      const metrics = operation.list?.readScrollMetrics()
      if (!metrics || metrics.scrollHeight > metrics.clientHeight)
        break
      try {
        if (!await loadOlderPage())
          break
      }
      catch {
        break
      }
      await nextTick()
    }
    if (!isCurrent(operation) || options.isLoading.value)
      return
    if (pendingPosition) {
      scrollState.value = detachChatScroll(scrollState.value)
      readingAnchor = pendingPosition
      pendingPosition = null
      restoreReadingPosition()
    }
    else if (scrollState.value.ownership !== 'detached') {
      writeTailPosition()
    }
    positionedScopeKey = scopeKey()
    isPositioning.value = false
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

  async function loadOlderHistory() {
    const list = options.list.value
    if (!list)
      return
    const operation = { generation: operationGeneration, list }
    pendingHistory = operation
    scrollState.value = detachChatScroll(scrollState.value)
    try {
      await loadOlderPage()
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
    catch {}
    if (!isActive())
      return
    await nextTick()
    if (!isActive())
      return
    if (revealOptions.highlight)
      operation.list?.highlightMessage(messageId)
    const metrics = operation.list?.scrollToMessage(messageId, revealOptions.behavior)
    if (metrics) {
      scrollState.value = recordProgrammaticChatScroll(scrollState.value, metrics)
      readingAnchor = operation.list?.captureScrollAnchor() ?? null
    }
    pendingPosition = null
    positionedScopeKey = scopeKey()
    isPositioning.value = false
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
    isPositioning,
    revealOutlineMessage,
    revealMessage,
    returnToLatest,
    showReturnToLatest,
  }
}
