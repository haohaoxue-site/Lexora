import type {
  LocalConversation,
  LocalConversationBranch,
} from '@buddy-electron/shared/localChatApi'
import { readonly, shallowRef } from 'vue'

interface HydrateChatSessionInput {
  activeBranchId: string | null
  activeConversationId: string | null
  projectId: string | null
}

export function useChatSession() {
  const activeConversationId = shallowRef<string | null>(null)
  const activeBranchId = shallowRef<string | null>(null)
  const projectId = shallowRef<string | null>(null)
  const branches = shallowRef<ReadonlyArray<LocalConversationBranch>>([])
  let navigationGeneration = 0

  function hydrate(input: HydrateChatSessionInput) {
    activeConversationId.value = input.activeConversationId
    activeBranchId.value = input.activeBranchId
    projectId.value = input.projectId
    branches.value = []
  }

  function activateConversation(conversation: LocalConversation) {
    navigationGeneration += 1
    activeConversationId.value = conversation.id
    activeBranchId.value = conversation.activeBranchId
    projectId.value = conversation.projectId
    branches.value = []
  }

  function activateDraft(nextProjectId: string | null) {
    navigationGeneration += 1
    activeConversationId.value = null
    activeBranchId.value = null
    projectId.value = nextProjectId
    branches.value = []
  }

  function acceptTurn(conversationId: string, branchId: string) {
    activeConversationId.value = conversationId
    activeBranchId.value = branchId
  }

  function setActiveBranch(branchId: string | null) {
    activeBranchId.value = branchId
  }

  function replaceBranches(value: ReadonlyArray<LocalConversationBranch>) {
    branches.value = value
  }

  function upsertBranch(branch: LocalConversationBranch) {
    const byId = new Map(branches.value.map(item => [item.id, item]))
    byId.set(branch.id, branch)
    branches.value = [...byId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
  }

  function generation() {
    return navigationGeneration
  }

  function isCurrent(
    expectedGeneration: number,
    conversationId?: string,
    branchId?: string,
  ) {
    return expectedGeneration === navigationGeneration
      && (conversationId === undefined || activeConversationId.value === conversationId)
      && (branchId === undefined || activeBranchId.value === branchId)
  }

  return {
    acceptTurn,
    activateConversation,
    activateDraft,
    activeBranchId: readonly(activeBranchId),
    activeConversationId: readonly(activeConversationId),
    branches: readonly(branches),
    generation,
    hydrate,
    isCurrent,
    projectId: readonly(projectId),
    replaceBranches,
    setActiveBranch,
    upsertBranch,
  }
}

export type ChatSession = ReturnType<typeof useChatSession>
