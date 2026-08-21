import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { computed, readonly, shallowRef, watch } from 'vue'
import { projectChatMessageSearchResults } from '@/workbenches/chat/transcript/chatMessageSearch'

interface DesktopConversationSearchOptions {
  activeBranchId: Readonly<Ref<string | null>>
  activeConversationId: Readonly<Ref<string | null>>
  loadMessages: () => Promise<ReadonlyArray<LocalMessage>>
}

export function useConversationSearch(options: DesktopConversationSearchOptions) {
  const isOpen = shallowRef(false)
  const isLoading = shallowRef(false)
  const query = shallowRef('')
  const messages = shallowRef<ReadonlyArray<LocalMessage>>([])
  const activeIndex = shallowRef(0)
  let loadGeneration = 0

  const results = computed(() => projectChatMessageSearchResults(messages.value, query.value))
  const activeMessageId = computed(() => results.value[activeIndex.value]?.messageId ?? null)
  const matchingMessageIds = computed(() => results.value.map(result => result.messageId))

  watch(query, () => activeIndex.value = 0)
  watch(
    [options.activeConversationId, options.activeBranchId],
    () => close(),
  )

  async function open() {
    if (!options.activeConversationId.value || !options.activeBranchId.value)
      return
    isOpen.value = true
    query.value = ''
    messages.value = []
    const conversationId = options.activeConversationId.value
    const branchId = options.activeBranchId.value
    const generation = ++loadGeneration
    isLoading.value = true
    try {
      const loadedMessages = await options.loadMessages()
      if (
        generation === loadGeneration
        && conversationId === options.activeConversationId.value
        && branchId === options.activeBranchId.value
      ) {
        messages.value = loadedMessages
      }
    }
    finally {
      if (generation === loadGeneration)
        isLoading.value = false
    }
  }

  function close() {
    loadGeneration += 1
    isOpen.value = false
    isLoading.value = false
    query.value = ''
    messages.value = []
    activeIndex.value = 0
  }

  function move(step: -1 | 1) {
    const count = results.value.length
    if (!count)
      return
    activeIndex.value = (activeIndex.value + step + count) % count
  }

  function setQuery(value: string) {
    query.value = value
  }

  return {
    activeIndex: readonly(activeIndex),
    activeMessageId,
    close,
    isLoading: readonly(isLoading),
    isOpen: readonly(isOpen),
    matchingMessageIds,
    move,
    open,
    query: readonly(query),
    resultCount: computed(() => results.value.length),
    setQuery,
  }
}
