import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { BuddyUserContentV1 } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyComposerSource } from '@buddy-shared/conversation/composerResource'

import type { LocalConversationBranch } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun } from '@buddy-shared/runs/runApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatComposerSubmitPayload } from '@/modules/prompt-input'
import type { ChatSession } from '@/modules/tasks/state/conversations/useChatSession'
import type { ChatDrafts, TaskModelSelection } from '@/modules/tasks/state/drafts/typing'
import type { ChatRunSync } from '@/modules/tasks/state/runs/typing'
import type { TaskIndexData } from '@/modules/tasks/state/task-index/useTaskIndexData'
import type { RuntimeSupervisorStore } from '@/platform/runtime/useRuntimeSupervisorStore'
import { createBuddyUserContent } from '@buddy-shared/conversation/buddyUserContent'
import { computed, readonly, shallowRef, watch } from 'vue'
import {
  createRequestFingerprint,
  createRequestIdRegistry,
} from '@/modules/tasks/model/requests/chatRequestIdentity'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'
import { getChatMessageText, getChatMessageUserContent } from '../../model/transcript/chatMessageContent'

interface ValueRef<T> {
  readonly value: T
}

export interface UseChatBranchMutationsOptions {
  activeRun: ValueRef<LocalRun | null>
  api: {
    chat: Pick<LocalChatApi['chat'], 'editUserMessage' | 'regenerateAssistant'>
    conversations: Pick<LocalChatApi['conversations'], 'activateBranch'>
  }
  canSendDraft: ValueRef<boolean>
  drafts: Pick<ChatDrafts, | 'beginIsolated'
  | 'cancelIsolated'
  | 'completeIsolated'
  | 'draftId'
  | 'isPersisted'
  | 'setUserContent'
  | 'snapshot'>
  taskIndexData: Pick<TaskIndexData, 'applyConversation' | 'refreshIndex' | 'updateConversationBranch'>
  session: Pick<ChatSession, | 'activeBranchId'
  | 'activeConversationId'
  | 'branches'
  | 'generation'
  | 'isCurrent'
  | 'setActiveBranch'
  | 'upsertBranch'>
  isSending: ValueRef<boolean>
  isUpdatingPermissionSettings: ValueRef<boolean>
  language: ValueRef<BuddyLocale>
  modelSelection: Pick<TaskModelSelection, 'selectedModel'>
  refreshBranches: () => Promise<void>
  persistWorkspaceState: () => Promise<boolean>
  runSync: Pick<ChatRunSync, 'applyEditedTurn' | 'applyRegeneratedTurn' | 'messages' | 'refreshActiveConversation'>
  selectComposerSource: (source: BuddyComposerSource, draftId?: string) => Promise<string | null>
  runtimeSupervisor: Pick<RuntimeSupervisorStore, 'runtimeState'>
  setErrorMessage: (message: string | null) => void
}

export function useChatBranchMutations(options: UseChatBranchMutationsOptions) {
  const isMutatingBranch = shallowRef(false)
  const editingMessage = shallowRef<{
    conversationId: string
    editScopeKey: string
    forkedFromMessageId: string | null
    parentBranchId: string
    userMessageId: string
  } | null>(null)
  const requestIds = createRequestIdRegistry()
  const canRunBranchMutation = computed(() =>
    options.runtimeSupervisor.runtimeState.value.status === 'ready'
    && options.session.activeConversationId.value !== null
    && options.session.activeBranchId.value !== null
    && !options.activeRun.value
    && !isMutatingBranch.value
    && !options.isSending.value
    && !options.isUpdatingPermissionSettings.value,
  )
  const canMutateBranch = computed(() => canRunBranchMutation.value && editingMessage.value === null)

  watch(
    () => [options.session.activeConversationId.value, options.session.activeBranchId.value] as const,
    ([conversationId, branchId]) => {
      const editing = editingMessage.value
      if (
        !editing
        || (editing.conversationId === conversationId && editing.parentBranchId === branchId)
      ) {
        return
      }
      options.drafts.cancelIsolated(editing.editScopeKey)
      editingMessage.value = null
    },
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

  async function editUserMessage(userMessageId: string) {
    const conversationId = options.session.activeConversationId.value
    const parentBranchId = options.session.activeBranchId.value
    const sourceMessage = options.runSync.messages.value.find(message => message.id === userMessageId)
    const selectedModel = options.modelSelection.selectedModel.value
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
    const sourceContent = getChatMessageUserContent(sourceMessage)
    const sourceUserContent = sourceContent?.userContent
      ?? createBuddyUserContent(getChatMessageText(sourceMessage))
    const editScopeKey = `message-edit:${conversationId}:${parentBranchId}:${userMessageId}`
    if (!options.drafts.beginIsolated(editScopeKey, withoutResourceReferences(sourceUserContent)))
      return false
    const editDraftId = options.drafts.draftId.value
    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(
      navigationVersion,
      conversationId,
      parentBranchId,
    )
    isMutatingBranch.value = true
    options.setErrorMessage(null)
    const resourceIdMap = new Map<string, string>()
    try {
      if (!await options.persistWorkspaceState()) {
        options.drafts.cancelIsolated(editScopeKey)
        return false
      }
      if (!isSourceViewCurrent()) {
        options.drafts.cancelIsolated(editScopeKey)
        return false
      }
      for (const snapshot of sourceContent?.resourceSnapshots ?? []) {
        const selected = await options.selectComposerSource({
          attachmentId: snapshot.attachmentId,
          branchId: parentBranchId,
          conversationId,
          messageId: userMessageId,
        }, editDraftId)
        if (!selected)
          throw new Error('Source message resource could not be selected')
        if (!isSourceViewCurrent()) {
          options.drafts.cancelIsolated(editScopeKey)
          return false
        }
        resourceIdMap.set(snapshot.resourceId, selected)
      }
      options.drafts.setUserContent(remapUserContentResources(sourceUserContent, resourceIdMap))
      if (!await options.persistWorkspaceState() || !isSourceViewCurrent()) {
        options.drafts.cancelIsolated(editScopeKey)
        return false
      }
      editingMessage.value = {
        conversationId,
        editScopeKey,
        forkedFromMessageId,
        parentBranchId,
        userMessageId,
      }
      return true
    }
    catch (error) {
      options.drafts.cancelIsolated(editScopeKey)
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  function cancelEditUserMessage() {
    const editing = editingMessage.value
    if (!editing)
      return false
    options.drafts.cancelIsolated(editing.editScopeKey)
    editingMessage.value = null
    return true
  }

  async function submitEditedMessage(payload: ChatComposerSubmitPayload) {
    const editing = editingMessage.value
    if (
      !editing
      || !canRunBranchMutation.value
      || !options.canSendDraft.value
      || !options.modelSelection.selectedModel.value
    ) {
      return false
    }
    const { conversationId, editScopeKey, forkedFromMessageId, parentBranchId, userMessageId } = editing
    if (
      options.session.activeConversationId.value !== conversationId
      || options.session.activeBranchId.value !== parentBranchId
    ) {
      return false
    }
    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(navigationVersion, conversationId, parentBranchId)
    isMutatingBranch.value = true
    options.setErrorMessage(null)
    try {
      options.drafts.setUserContent(payload.userContent ?? createBuddyUserContent(payload.content))
      if (!await options.persistWorkspaceState() || !isSourceViewCurrent() || editingMessage.value !== editing)
        return false
      const draft = options.drafts.snapshot(editScopeKey)
      if (!options.drafts.isPersisted(draft))
        return false
      const requestInput = {
        conversationId,
        draftId: draft.draftId,
        expectedRevision: draft.revision!,
        userMessageId,
      }
      const operationKey = `edit:${await createRequestFingerprint(requestInput)}`
      const requestId = requestIds.resolve(operationKey)
      const turn = await options.api.chat.editUserMessage({ ...requestInput, requestId })
      if (!turn.draftReceipt)
        throw new Error('Edited turn did not commit its Composer draft')
      requestIds.release(operationKey)
      const branch: LocalConversationBranch = {
        conversationId,
        createdAt: turn.run.startedAt,
        forkedFromMessageId,
        id: turn.branchId,
        parentBranchId: forkedFromMessageId ? parentBranchId : null,
      }
      if (!options.drafts.completeIsolated(
        turn.draftReceipt,
        `conversation:${conversationId}:${turn.branchId}`,
        editScopeKey,
      )) {
        throw new Error('Edited Composer draft receipt did not match the active edit')
      }
      editingMessage.value = null
      if (!isSourceViewCurrent()) {
        void options.taskIndexData.refreshIndex().catch(() => {})
        return true
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
    cancelEditUserMessage,
    canMutateBranch: readonly(canMutateBranch),
    editUserMessage,
    editingMessageId: computed(() => editingMessage.value?.userMessageId ?? null),
    isMutatingBranch: readonly(isMutatingBranch),
    regenerateAssistant,
    submitEditedMessage,
  }
}

function remapUserContentResources(
  content: BuddyUserContentV1,
  ids: ReadonlyMap<string, string>,
): BuddyUserContentV1 {
  return {
    ...content,
    body: content.body.map(paragraph => ({
      ...paragraph,
      content: paragraph.content.map(node => node.type === 'resource_ref'
        ? { ...node, resourceId: ids.get(node.resourceId) ?? node.resourceId }
        : node),
    })),
    panelResourceIds: content.panelResourceIds.map(id => ids.get(id) ?? id),
  }
}

function withoutResourceReferences(content: BuddyUserContentV1): BuddyUserContentV1 {
  return {
    ...content,
    body: content.body.map(paragraph => ({
      ...paragraph,
      content: paragraph.content.filter(node => node.type !== 'resource_ref'),
    })),
    panelResourceIds: [],
  }
}
