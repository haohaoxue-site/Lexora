import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalProject,
} from '@buddy-electron/shared/localChatApi'
import { readonly, shallowRef } from 'vue'

interface UseChatIndexDataOptions {
  api: LexoraDesktopApi['localChat']
}

export function useChatIndexData(options: UseChatIndexDataOptions) {
  const projects = shallowRef<ReadonlyArray<LocalProject>>([])
  const conversations = shallowRef<ReadonlyArray<LocalConversationSummary>>([])
  let conversationListGeneration = 0

  async function refreshIndex() {
    const [nextProjects] = await Promise.all([
      options.api.projects.list(),
      refreshConversations(),
    ])
    projects.value = nextProjects
  }

  async function refreshConversations() {
    const generation = ++conversationListGeneration
    const nextConversations = await options.api.conversations.list()
    if (generation === conversationListGeneration)
      conversations.value = nextConversations
  }

  function replaceProjects(value: ReadonlyArray<LocalProject>) {
    projects.value = value
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
    projects: readonly(projects),
    refreshIndex,
    refreshConversations,
    replaceProjects,
    updateConversationBranch,
  }
}

export type ChatIndexData = ReturnType<typeof useChatIndexData>
