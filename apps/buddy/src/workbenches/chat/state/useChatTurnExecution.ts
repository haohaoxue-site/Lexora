import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalPromptContextItem,
  LocalRun,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyApprovalPolicy } from '@buddy-shared/approvalPolicy'
import type { ParsedBuddyChatCommand } from '@buddy-shared/buddyChatCommands'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { ChatComposerSubmitPayload } from '@/workbenches/chat/composer/chatComposerInput'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import type { TaskIndexData } from '@/workbenches/tasks/state/useTaskIndexData'
import { parseBuddyChatCommand } from '@buddy-shared/buddyChatCommands'
import { computed, readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import {
  createRequestFingerprint,
  createRequestIdRegistry,
} from '@/workbenches/chat/state/chatRequestIdentity'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatTurnExecutionOptions {
  activeRun: ValueRef<LocalRun | null>
  approvalPolicy: ValueRef<BuddyApprovalPolicy>
  api: LexoraDesktopApi['localChat']
  taskIndexData: TaskIndexData
  session: ChatSession
  drafts: ReturnType<typeof useChatDrafts>
  draftScopeKey: ValueRef<string>
  executionProfile: ValueRef<BuddyExecutionProfile>
  getRunTerminationMessage: (errorCode: string | null) => string
  isUpdatingPermissionSettings: ValueRef<boolean>
  language: ValueRef<BuddyLocale>
  modelProviders: ModelProvidersStore
  onActionCommandRunStarted: (runId: string) => void
  persistWorkspaceState: () => Promise<boolean>
  runSync: ReturnType<typeof useChatRunSync>
  runtimeSupervisor: RuntimeSupervisorStore
  setErrorMessage: (message: string | null) => void
  unavailableCommandMessage: () => string
}

export function useChatTurnExecution(options: UseChatTurnExecutionOptions) {
  const isSending = shallowRef(false)
  const requestIds = createRequestIdRegistry()
  const canSend = computed(() =>
    options.runtimeSupervisor.runtimeState.value.status === 'ready'
    && options.modelProviders.selectedModel.value !== null
    && !options.activeRun.value
    && !isSending.value
    && !options.isUpdatingPermissionSettings.value,
  )

  async function send(payload: ChatComposerSubmitPayload | string) {
    const content = typeof payload === 'string' ? payload : payload.content
    const contextItems: ReadonlyArray<LocalPromptContextItem> = typeof payload === 'string'
      ? []
      : payload.contextItems
    if ((!content.trim() && !options.drafts.attachments.value.length) || !canSend.value)
      return false
    const command = parseBuddyChatCommand(content)
    if (command?.kind === 'action')
      return executeActionCommand(command, contextItems)

    const sourceScopeKey = options.draftScopeKey.value
    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(navigationVersion)
      && options.draftScopeKey.value === sourceScopeKey
    const selectedModel = options.modelProviders.selectedModel.value
    const modelSelection = selectedModel
      ? {
          modelId: selectedModel.modelId,
          providerId: selectedModel.providerId,
          reasoning: options.modelProviders.selectedEffort.value,
          serviceTier: options.modelProviders.selectedServiceTier.value,
        }
      : null
    const turnRequest = {
      approvalPolicy: options.approvalPolicy.value,
      attachmentIds: options.drafts.attachments.value.map(item => item.attachmentId),
      branchId: options.session.activeBranchId.value,
      content: content.trim(),
      contextItems: [...contextItems],
      conversationId: options.session.activeConversationId.value,
      draftId: options.drafts.draftId.value,
      executionProfile: options.executionProfile.value,
      modelSelection,
      spaceId: options.session.spaceId.value,
    }
    const preparedDraft = options.drafts.prepareSend(
      await createRequestFingerprint(turnRequest),
    )
    isSending.value = true
    options.setErrorMessage(null)
    try {
      if (!await options.persistWorkspaceState())
        return false
      const result = await options.api.chat.startTurn({
        ...turnRequest,
        requestId: preparedDraft.requestId,
      })
      const sourceViewIsCurrent = isSourceViewCurrent()
      if (sourceViewIsCurrent) {
        options.session.acceptTurn(result.conversationId, result.branchId)
        if (!options.session.branches.value.some(
          branch => branch.id === result.branchId,
        )) {
          options.session.upsertBranch({
            conversationId: result.conversationId,
            createdAt: result.run.startedAt,
            forkedFromMessageId: null,
            id: result.branchId,
            parentBranchId: null,
          })
        }
        options.runSync.applyRunStart(result)
      }
      if (result.run.status === 'failed' || result.run.status === 'cancelled') {
        options.drafts.retarget(sourceScopeKey, `conversation:${result.conversationId}`)
        if (sourceViewIsCurrent) {
          options.drafts.restoreCurrentDraft()
          options.setErrorMessage(options.getRunTerminationMessage(result.run.errorCode))
        }
        refreshTaskIndex()
        void options.persistWorkspaceState()
        return false
      }
      options.drafts.clear(sourceScopeKey)
      if (sourceViewIsCurrent)
        options.drafts.restoreCurrentDraft()
      refreshTaskIndex()
      void options.persistWorkspaceState()
      return true
    }
    catch (error) {
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isSending.value = false
    }
  }

  async function executeActionCommand(
    command: Extract<ParsedBuddyChatCommand, { kind: 'action' }>,
    contextItems: ReadonlyArray<LocalPromptContextItem>,
  ): Promise<boolean> {
    const conversationId = options.session.activeConversationId.value
    const branchId = options.session.activeBranchId.value
    const commandItems = contextItems.filter(item => item.kind === 'slashCommand')
    if (
      !conversationId
      || !branchId
      || options.drafts.attachments.value.length > 0
      || contextItems.some(item => item.kind !== 'slashCommand')
      || commandItems.length > 1
      || (commandItems[0] && commandItems[0].value !== `/${command.name}`)
    ) {
      options.setErrorMessage(options.unavailableCommandMessage())
      return false
    }

    const sourceScopeKey = options.draftScopeKey.value
    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(
      navigationVersion,
      conversationId,
      branchId,
    )
    const operationKey = `command:${conversationId}:${branchId}:${command.name}:${command.arguments}`
    const requestId = requestIds.resolve(operationKey)
    isSending.value = true
    options.setErrorMessage(null)
    try {
      if (!await options.persistWorkspaceState())
        return false
      const result = await options.api.chat.executeCommand({
        arguments: command.arguments,
        branchId,
        command: command.name,
        conversationId,
        requestId,
      })
      requestIds.release(operationKey)
      if (isSourceViewCurrent()) {
        options.onActionCommandRunStarted(result.runId)
        options.runSync.applyRunStart(result)
      }
      if (result.run.status === 'failed' || result.run.status === 'cancelled') {
        if (
          isSourceViewCurrent()
          && result.run.errorCode !== 'CONTEXT_COMPACTION_NOT_NEEDED'
        ) {
          options.setErrorMessage(options.getRunTerminationMessage(result.run.errorCode))
        }
        return false
      }
      options.drafts.clear(sourceScopeKey)
      if (isSourceViewCurrent())
        options.drafts.restoreCurrentDraft()
      refreshTaskIndex()
      void options.persistWorkspaceState()
      return true
    }
    catch (error) {
      if (isSourceViewCurrent())
        setNormalizedError(error)
      return false
    }
    finally {
      isSending.value = false
    }
  }

  async function cancelActiveRun() {
    if (!options.activeRun.value)
      return
    try {
      options.runSync.upsertRuns([await options.api.chat.cancel(options.activeRun.value.id)])
    }
    catch (error) {
      setNormalizedError(error)
    }
  }

  function refreshTaskIndex() {
    void options.taskIndexData.refreshIndex().catch(() => {})
  }

  function setNormalizedError(error: unknown) {
    options.setErrorMessage(resolveLocalChatErrorMessage(error, options.language.value))
  }

  return {
    canSend: readonly(canSend),
    cancelActiveRun,
    isSending: readonly(isSending),
    send,
  }
}
