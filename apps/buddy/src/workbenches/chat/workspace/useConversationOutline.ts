import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { computed, readonly, shallowRef, watch } from 'vue'
import {
  mergeChatOutlineMessages,
  projectChatOutlineItems,
} from '@/workbenches/chat/transcript/chatOutline'

interface UseConversationOutlineOptions {
  activeBranchId: Readonly<Ref<string | null>>
  activeConversationId: Readonly<Ref<string | null>>
  currentMessages: Readonly<Ref<ReadonlyArray<LocalMessage>>>
  loadMessages: () => Promise<ReadonlyArray<LocalMessage>>
}

export function useConversationOutline(options: UseConversationOutlineOptions) {
  const isLoading = shallowRef(false)
  const loadedMessages = shallowRef<ReadonlyArray<LocalMessage>>([])
  const loadedScopeKey = shallowRef<string | null>(null)
  let loadGeneration = 0

  const scopeKey = computed(() => {
    const conversationId = options.activeConversationId.value
    const branchId = options.activeBranchId.value
    return conversationId && branchId ? `${conversationId}:${branchId}` : null
  })
  const messages = computed(() => (
    loadedScopeKey.value === scopeKey.value
      ? mergeChatOutlineMessages(loadedMessages.value, options.currentMessages.value)
      : options.currentMessages.value
  ))
  const items = computed(() => projectChatOutlineItems(messages.value))

  watch(scopeKey, () => reset())

  async function prepare() {
    const sourceScopeKey = scopeKey.value
    if (!sourceScopeKey || loadedScopeKey.value === sourceScopeKey || isLoading.value)
      return

    const generation = ++loadGeneration
    isLoading.value = true
    try {
      const nextMessages = await options.loadMessages()
      if (generation === loadGeneration && sourceScopeKey === scopeKey.value) {
        loadedMessages.value = nextMessages
        loadedScopeKey.value = sourceScopeKey
      }
    }
    finally {
      if (generation === loadGeneration)
        isLoading.value = false
    }
  }

  function reset() {
    loadGeneration += 1
    isLoading.value = false
    loadedMessages.value = []
    loadedScopeKey.value = null
  }

  return {
    isLoading: readonly(isLoading),
    items,
    prepare,
  }
}
