import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import type { TaskIndexData } from '@/workbenches/tasks/state/useTaskIndexData'
import { computed, readonly, shallowRef } from 'vue'

interface UseChatConversationsOptions {
  api: LexoraDesktopApi['localChat']
  taskIndexData: TaskIndexData
  clearError: () => void
  drafts: ReturnType<typeof useChatDrafts>
  onError: (error: unknown) => void
  persistWorkspaceState: () => Promise<boolean>
  runSync: ReturnType<typeof useChatRunSync>
  selectDefaultModel: () => void
  session: ChatSession
}

export function useChatConversations(options: UseChatConversationsOptions) {
  const directlyOpenedConversation = shallowRef<Awaited<
    ReturnType<typeof options.api.conversations.get>
  > | null>(null)
  const activeConversation = computed(() => (
    directlyOpenedConversation.value?.id === options.session.activeConversationId.value
      ? directlyOpenedConversation.value
      : options.taskIndexData.conversations.value.find(
        conversation => conversation.id === options.session.activeConversationId.value,
      ) ?? null
  ))

  async function refreshBranches() {
    const conversationId = options.session.activeConversationId.value
    const navigationVersion = options.session.generation()
    if (!conversationId) {
      options.session.replaceBranches([])
      return
    }
    const branches = await options.api.conversations.listBranches(conversationId)
    if (options.session.isCurrent(navigationVersion, conversationId))
      options.session.replaceBranches(branches)
  }

  async function openConversation(conversationId: string) {
    const indexed = options.taskIndexData.conversations.value.find(
      item => item.id === conversationId,
    )
    const conversation = indexed ?? await options.api.conversations.get(conversationId).catch(
      (error) => {
        options.onError(error)
        return null
      },
    )
    if (!conversation)
      return
    directlyOpenedConversation.value = indexed ? null : conversation
    options.drafts.saveCurrentDraft()
    options.session.activateConversation(conversation)
    options.drafts.restoreCurrentDraft()
    await options.persistWorkspaceState()
    await Promise.all([
      refreshBranches(),
      options.runSync.refreshActiveConversation(),
    ])
  }

  async function activateGlobalDraft() {
    activateDraftScope(null)
    options.selectDefaultModel()
    await options.persistWorkspaceState()
  }

  async function deleteConversation(conversationId: string) {
    try {
      await options.api.conversations.delete(conversationId)
      await options.drafts.discard(`conversation:${conversationId}`)
      if (options.session.activeConversationId.value === conversationId)
        activateDraftScope(null, false)
      if (directlyOpenedConversation.value?.id === conversationId)
        directlyOpenedConversation.value = null
      await options.taskIndexData.refreshIndex()
      await options.persistWorkspaceState()
    }
    catch (error) {
      options.onError(error)
    }
  }

  async function renameConversation(conversationId: string, title: string) {
    try {
      const conversation = await options.api.conversations.rename(conversationId, title)
      options.taskIndexData.applyConversation(conversation)
      if (directlyOpenedConversation.value?.id === conversationId)
        directlyOpenedConversation.value = conversation
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function listActiveConversationMessages() {
    const conversationId = options.session.activeConversationId.value
    const branchId = options.session.activeBranchId.value
    if (!conversationId || !branchId)
      return []

    try {
      let cursor: string | undefined
      let messages = [] as typeof options.runSync.messages.value
      do {
        const page = await options.api.conversations.listMessages({
          branchId,
          conversationId,
          cursor,
          limit: 500,
        })
        if (
          conversationId !== options.session.activeConversationId.value
          || branchId !== options.session.activeBranchId.value
        ) {
          return []
        }
        messages = [...page.items, ...messages]
        cursor = page.nextCursor ?? undefined
      } while (cursor)

      return messages
    }
    catch (error) {
      options.onError(error)
      return []
    }
  }

  function activateDraftScope(projectId: string | null, preserveCurrent = true) {
    if (preserveCurrent)
      options.drafts.saveCurrentDraft()
    options.session.activateDraft(projectId)
    directlyOpenedConversation.value = null
    options.runSync.clearConversationState()
    options.drafts.restoreCurrentDraft()
    options.clearError()
  }

  return {
    activateDraftScope,
    activeConversation: readonly(activeConversation),
    activateGlobalDraft,
    deleteConversation,
    listActiveConversationMessages,
    openConversation,
    refreshBranches,
    renameConversation,
  }
}
