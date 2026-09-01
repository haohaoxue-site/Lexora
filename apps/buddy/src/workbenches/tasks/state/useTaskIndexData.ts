import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalSpace,
} from '@buddy-electron/shared/localChatApi'
import { readonly, shallowRef } from 'vue'

interface UseTaskIndexDataOptions {
  api: LexoraDesktopApi['localChat']
}

export function useTaskIndexData(options: UseTaskIndexDataOptions) {
  const spaces = shallowRef<ReadonlyArray<LocalSpace>>([])
  const conversations = shallowRef<ReadonlyArray<LocalConversationSummary>>([])
  let conversationListGeneration = 0

  async function refreshIndex() {
    const [nextSpaces] = await Promise.all([
      options.api.spaces.list(),
      refreshConversations(),
    ])
    spaces.value = nextSpaces
  }

  async function refreshConversations() {
    const generation = ++conversationListGeneration
    const nextConversations = await options.api.conversations.list()
    if (generation === conversationListGeneration)
      conversations.value = nextConversations
  }

  function replaceSpaces(value: ReadonlyArray<LocalSpace>) {
    spaces.value = value
  }

  function applyConversation(conversation: LocalConversation) {
    const existing = conversations.value.find(item => item.id === conversation.id)
    if (!existing) {
      void refreshConversations().catch(() => {})
      return
    }
    conversations.value = conversations.value.map(item => item.id === conversation.id
      ? { ...item, ...conversation }
      : item)
  }

  function updateConversationBranch(
    conversationId: string,
    branchId: string,
    updatedAt: string,
  ) {
    conversations.value = conversations.value.map(conversation => conversation.id === conversationId
      ? { ...conversation, activeBranchId: branchId, updatedAt }
      : conversation)
  }

  return {
    applyConversation,
    conversations: readonly(conversations),
    spaces: readonly(spaces),
    refreshIndex,
    refreshConversations,
    replaceSpaces,
    updateConversationBranch,
  }
}

export type TaskIndexData = ReturnType<typeof useTaskIndexData>
