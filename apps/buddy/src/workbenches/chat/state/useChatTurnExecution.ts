import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalPromptContextItem,
  LocalRun,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyApprovalPolicy } from '@buddy-shared/approvalPolicy'
import type { ParsedBuddyChatCommand } from '@buddy-shared/buddyChatCommands'
import type { BuddyUserContentV1 } from '@buddy-shared/buddyUserContent'
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
import { getBuddyUserContentResourceIds } from '@buddy-shared/buddyUserContent'
import { computed, readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import { createRequestIdRegistry } from '@/workbenches/chat/state/chatRequestIdentity'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatTurnExecutionOptions {
  activeRun: ValueRef<LocalRun | null>
  approvalPolicy: ValueRef<BuddyApprovalPolicy>
  api: LexoraDesktopApi['localChat']
  canSendDraft: ValueRef<boolean>
  taskIndexData: TaskIndexData
  session: ChatSession
  drafts: ReturnType<typeof useChatDrafts>
  draftScopeKey: ValueRef<string>
  draftChangedMessage: () => string
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
    && options.canSendDraft.value
    && options.modelProviders.selectedModel.value !== null
    && !options.activeRun.value
    && !isSending.value
    && !options.isUpdatingPermissionSettings.value,
  )

  async function send(payload: ChatComposerSubmitPayload | string) {
    const userContent = typeof payload === 'string' ? undefined : payload.userContent
    const content = typeof payload === 'string' ? payload : payload.content
    if (userContent)
      options.drafts.setUserContent(userContent)
    const resourceIds = userContent
      ? getBuddyUserContentResourceIds(userContent)
      : options.drafts.resourceIdsForDraft(options.drafts.draftId.value)
    const contextItems: ReadonlyArray<LocalPromptContextItem> = userContent
      ? userContent.body.flatMap(paragraph => paragraph.content.flatMap(node => node.type === 'prompt_directive' ? [{ kind: node.directive === 'skill' ? 'skill' as const : 'slashCommand' as const, value: node.value }] : []))
      : []
    if ((!content.trim() && !resourceIds.length) || !canSend.value)
      return false
    const command = parseBuddyChatCommand(content)
    if (command?.kind === 'action' && resourceIds.length) {
      options.setErrorMessage(options.unavailableCommandMessage())
      return false
    }
    if (command?.kind === 'action') {
      options.drafts.setUserContent(createActionCommandContent(command))
      return executeActionCommand(command, contextItems)
    }

    const sourceScopeKey = options.draftScopeKey.value
    const navigationVersion = options.session.generation()
    const isSourceViewCurrent = () => options.session.isCurrent(navigationVersion)
      && options.draftScopeKey.value === sourceScopeKey
    isSending.value = true
    options.setErrorMessage(null)
    try {
      if (!await options.persistWorkspaceState())
        return false
      const confirmedDraft = options.drafts.snapshot(sourceScopeKey)
      if (!options.drafts.isPersisted(confirmedDraft)) {
        if (isSourceViewCurrent())
          options.setErrorMessage(options.draftChangedMessage())
        return false
      }
      const expectedRevision = confirmedDraft.revision!
      const operationKey = `turn:${confirmedDraft.draftId}:${expectedRevision}`
      const requestId = requestIds.resolve(operationKey)
      const result = await options.api.chat.startTurn({
        draftId: confirmedDraft.draftId,
        expectedRevision,
        requestId,
      })
      if (!result.draftReceipt)
        throw new Error('Turn did not commit its Composer draft')
      requestIds.release(operationKey)
      const sourceViewIsCurrent = isSourceViewCurrent()
      const targetScopeKey = `conversation:${result.conversationId}:${result.branchId}`
      const acknowledged = options.drafts.acknowledgeSend(result.draftReceipt, targetScopeKey)
      if (sourceViewIsCurrent && (acknowledged || sourceScopeKey === targetScopeKey)) {
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
        if (sourceViewIsCurrent) {
          options.setErrorMessage(options.getRunTerminationMessage(result.run.errorCode))
        }
      }
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
    isSending.value = true
    options.setErrorMessage(null)
    try {
      if (!await options.persistWorkspaceState())
        return false
      const confirmedDraft = options.drafts.snapshot(sourceScopeKey)
      if (!options.drafts.isPersisted(confirmedDraft)) {
        if (isSourceViewCurrent())
          options.setErrorMessage(options.draftChangedMessage())
        return false
      }
      const expectedRevision = confirmedDraft.revision!
      const operationKey = `command:${confirmedDraft.draftId}:${expectedRevision}`
      const requestId = requestIds.resolve(operationKey)
      const result = await options.api.chat.executeCommand({
        draftId: confirmedDraft.draftId,
        expectedRevision,
        requestId,
      })
      if (!result.draftReceipt)
        throw new Error('Command did not commit its Composer draft')
      requestIds.release(operationKey)
      options.drafts.acknowledgeSend(result.draftReceipt, sourceScopeKey)
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
      }
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

function createActionCommandContent(
  command: Extract<ParsedBuddyChatCommand, { kind: 'action' }>,
): BuddyUserContentV1 {
  return {
    body: [{
      content: [
        {
          commandMode: 'action',
          directive: 'slash_command',
          type: 'prompt_directive',
          value: `/${command.name}`,
        },
        ...(command.arguments
          ? [{ text: ` ${command.arguments}`, type: 'text' as const }]
          : []),
      ],
      type: 'paragraph',
    }],
    panelResourceIds: [],
    version: 1,
  }
}
