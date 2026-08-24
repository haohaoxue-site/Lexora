import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalRun,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { ChatIndexData } from '@/workbenches/chat/state/useChatIndexData'
import { computed, readonly, shallowRef } from 'vue'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatExecutionProfileOptions {
  activeConversation: ValueRef<LocalConversation | null>
  activeConversationId: ValueRef<string | null>
  activeRun: ValueRef<LocalRun | null>
  api: LexoraDesktopApi['localChat']['conversations']
  chatIndexData: ChatIndexData
  drafts: ReturnType<typeof useChatDrafts>
  onError: (error: unknown) => void
  persistWorkspaceState: () => Promise<boolean>
}

export function useChatExecutionProfile(options: UseChatExecutionProfileOptions) {
  const isUpdating = shallowRef(false)
  const executionProfile = computed<BuddyExecutionProfile>(() => (
    options.activeRun.value?.executionProfile
    ?? options.activeConversation.value?.executionProfile
    ?? options.drafts.executionProfile.value
  ))
  const canUpdate = computed(() => (
    !options.activeRun.value
    && !isUpdating.value
    && (
      options.activeConversationId.value === null
      || options.activeConversation.value !== null
    )
  ))

  async function setExecutionProfile(value: BuddyExecutionProfile): Promise<boolean> {
    if (value === executionProfile.value)
      return true
    if (!canUpdate.value)
      return false

    const conversation = options.activeConversation.value
    isUpdating.value = true
    try {
      if (conversation) {
        const updated = await options.api.setExecutionProfile(conversation.id, value)
        options.chatIndexData.applyConversation(updated)
        return true
      }

      const previous = options.drafts.executionProfile.value
      options.drafts.setExecutionProfile(value)
      if (await options.persistWorkspaceState())
        return true
      options.drafts.setExecutionProfile(previous)
      return false
    }
    catch (error) {
      options.onError(error)
      return false
    }
    finally {
      isUpdating.value = false
    }
  }

  return {
    canUpdate: readonly(canUpdate),
    executionProfile: readonly(executionProfile),
    isUpdating: readonly(isUpdating),
    setExecutionProfile,
  }
}
