import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { ChatTranscriptProjection } from '@/workbenches/chat/transcript/chatTranscriptProjection'
import { computed, readonly, shallowRef, watch } from 'vue'
import { createChatOutlineProjector } from '@/workbenches/chat/transcript/chatOutline'

interface UseConversationOutlineOptions {
  activeBranchId: Readonly<Ref<string | null>>
  activeConversationId: Readonly<Ref<string | null>>
  loadMessages: () => Promise<ReadonlyArray<LocalMessage>>
  transcriptProjection: Readonly<Ref<ChatTranscriptProjection>>
}

const EMPTY_MESSAGES: ReadonlyArray<LocalMessage> = []

export function useConversationOutline(options: UseConversationOutlineOptions) {
  const isLoading = shallowRef(false)
  const loadedMessages = shallowRef<ReadonlyArray<LocalMessage>>([])
  const loadedScopeKey = shallowRef<string | null>(null)
  const outlineProjector = createChatOutlineProjector()
  let loadGeneration = 0

  const scopeKey = computed(() => {
    const conversationId = options.activeConversationId.value
    const branchId = options.activeBranchId.value
    return conversationId && branchId ? `${conversationId}:${branchId}` : null
  })
  const items = computed(() => outlineProjector.project(
    options.transcriptProjection.value,
    loadedScopeKey.value === scopeKey.value ? loadedMessages.value : EMPTY_MESSAGES,
  ))

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
