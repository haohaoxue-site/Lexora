import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversationBranch,
  LocalPromptContextItem,
  LocalRun,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import type { TaskIndexData } from '@/workbenches/tasks/state/useTaskIndexData'
import { computed, readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import {
  createRequestFingerprint,
  createRequestIdRegistry,
} from '@/workbenches/chat/state/chatRequestIdentity'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatBranchMutationsOptions {
  activeRun: ValueRef<LocalRun | null>
  api: LexoraDesktopApi['localChat']
  taskIndexData: TaskIndexData
  session: ChatSession
  isSending: ValueRef<boolean>
  isUpdatingPermissionSettings: ValueRef<boolean>
  language: ValueRef<BuddyLocale>
  modelProviders: ModelProvidersStore
  refreshBranches: () => Promise<void>
  runSync: ReturnType<typeof useChatRunSync>
  runtimeSupervisor: RuntimeSupervisorStore
  setErrorMessage: (message: string | null) => void
}

export function useChatBranchMutations(options: UseChatBranchMutationsOptions) {
  const isMutatingBranch = shallowRef(false)
  const requestIds = createRequestIdRegistry()
  const canMutateBranch = computed(() =>
    options.runtimeSupervisor.runtimeState.value.status === 'ready'
    && options.session.activeConversationId.value !== null
    && options.session.activeBranchId.value !== null
    && !options.activeRun.value
    && !isMutatingBranch.value
    && !options.isSending.value
    && !options.isUpdatingPermissionSettings.value,
  )

  async function activateBranch(branchId: string) {
    const conversationId = options.session.activeConversationId.value
    if (!conversationId || !canMutateBranch.value)
      return false
    if (branchId === options.session.activeBranchId.value)
      return true
    if (!options.session.branches.value.some(branch => branch.id === branchId))
      return false

    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(
      navigationVersion,
      conversationId,
    )
    isMutatingBranch.value = true
    options.setErrorMessage(null)
    try {
      const conversation = await options.api.conversations.activateBranch({
        branchId,
        conversationId,
      })
      if (!isSourceViewCurrent()) {
        void options.taskIndexData.refreshIndex().catch(() => {})
        return true
      }
      options.taskIndexData.applyConversation(conversation)
      options.session.setActiveBranch(conversation.activeBranchId)
      await refreshAcceptedBranchState(conversationId)
      return true
    }
    catch (error) {
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function editUserMessage(userMessageId: string, content: string) {
    const conversationId = options.session.activeConversationId.value
    const parentBranchId = options.session.activeBranchId.value
    const sourceMessage = options.runSync.messages.value.find(message => message.id === userMessageId)
    const selectedModel = options.modelProviders.selectedModel.value
    if (
      !conversationId
      || !parentBranchId
      || sourceMessage?.role !== 'user'
      || !selectedModel
      || !canMutateBranch.value
    ) {
      return false
    }
    const sourceIndex = options.runSync.messages.value.findIndex(
      message => message.id === userMessageId,
    )
    const forkedFromMessageId = sourceIndex > 0
      ? options.runSync.messages.value[sourceIndex - 1]?.id ?? null
      : null
    const attachmentIds = sourceMessage.attachments.map(attachment => attachment.attachmentId)
    const contextItems = readMessageContextItems(sourceMessage.content)
    const trimmedContent = content.trim()
    if (!trimmedContent && !attachmentIds.length)
      return false

    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(
      navigationVersion,
      conversationId,
      parentBranchId,
    )
    const requestInput = {
      attachmentIds,
      content: trimmedContent,
      contextItems,
      conversationId,
      modelSelection: {
        modelId: selectedModel.modelId,
        providerId: selectedModel.providerId,
        reasoning: options.modelProviders.selectedEffort.value,
        serviceTier: options.modelProviders.selectedServiceTier.value,
      },
      userMessageId,
    }
    const operationKey = `edit:${await createRequestFingerprint(requestInput)}`
    const requestId = requestIds.resolve(operationKey)
    const request = { ...requestInput, draftId: requestId }
    isMutatingBranch.value = true
    options.setErrorMessage(null)
    try {
      const turn = await options.api.chat.editUserMessage({ ...request, requestId })
      requestIds.release(operationKey)
      if (!isSourceViewCurrent()) {
        void options.taskIndexData.refreshIndex().catch(() => {})
        return true
      }
      const branch: LocalConversationBranch = {
        conversationId,
        createdAt: turn.run.startedAt,
        forkedFromMessageId,
        id: turn.branchId,
        parentBranchId: forkedFromMessageId ? parentBranchId : null,
      }
      options.session.setActiveBranch(turn.branchId)
      options.session.upsertBranch(branch)
      options.taskIndexData.updateConversationBranch(
        conversationId,
        turn.branchId,
        turn.run.startedAt,
      )
      options.runSync.applyEditedTurn(turn, userMessageId)
      refreshBranchStateAfterMutation(conversationId)
      return true
    }
    catch (error) {
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function regenerateAssistant(sourceRunId: string) {
    const conversationId = options.session.activeConversationId.value
    const parentBranchId = options.session.activeBranchId.value
    if (!conversationId || !parentBranchId || !canMutateBranch.value)
      return false

    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(
      navigationVersion,
      conversationId,
      parentBranchId,
    )
    const operationKey = `regenerate:${conversationId}:${parentBranchId}:${sourceRunId}`
    const requestId = requestIds.resolve(operationKey)
    isMutatingBranch.value = true
    options.setErrorMessage(null)
    try {
      const turn = await options.api.chat.regenerateAssistant({
        conversationId,
        requestId,
        sourceRunId,
      })
      requestIds.release(operationKey)
      if (!isSourceViewCurrent()) {
        void options.taskIndexData.refreshIndex().catch(() => {})
        return true
      }
      const branch: LocalConversationBranch = {
        conversationId,
        createdAt: turn.run.startedAt,
        forkedFromMessageId: turn.run.triggeringMessageId,
        id: turn.branchId,
        parentBranchId,
      }
      options.session.setActiveBranch(turn.branchId)
      options.session.upsertBranch(branch)
      options.taskIndexData.updateConversationBranch(
        conversationId,
        turn.branchId,
        turn.run.startedAt,
      )
      options.runSync.applyRegeneratedTurn(turn)
      refreshBranchStateAfterMutation(conversationId)
      return true
    }
    catch (error) {
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function refreshAcceptedBranchState(conversationId: string) {
    const results = await Promise.allSettled([
      options.refreshBranches(),
      options.runSync.refreshActiveConversation(),
      options.taskIndexData.refreshIndex(),
    ])
    const rejected = results.find(result => result.status === 'rejected')
    if (
      rejected?.status === 'rejected'
      && options.session.activeConversationId.value === conversationId
    ) {
      setNormalizedError(rejected.reason)
    }
  }

  function refreshBranchStateAfterMutation(conversationId: string) {
    void Promise.all([
      options.refreshBranches(),
      options.taskIndexData.refreshIndex(),
    ]).catch((error) => {
      if (options.session.activeConversationId.value === conversationId)
        setNormalizedError(error)
    })
  }

  function setNormalizedError(error: unknown) {
    options.setErrorMessage(resolveLocalChatErrorMessage(error, options.language.value))
  }

  return {
    activateBranch,
    canMutateBranch: readonly(canMutateBranch),
    editUserMessage,
    isMutatingBranch: readonly(isMutatingBranch),
    regenerateAssistant,
  }
}

function readMessageContextItems(value: unknown): ReadonlyArray<LocalPromptContextItem> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return []
  const items = (value as Record<string, unknown>).contextItems
  if (!Array.isArray(items))
    return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return []
    const record = item as Record<string, unknown>
    if (
      (record.kind !== 'file' && record.kind !== 'skill' && record.kind !== 'slashCommand')
      || typeof record.value !== 'string'
      || !record.value
    ) {
      return []
    }
    return [{ kind: record.kind, value: record.value }]
  })
}
