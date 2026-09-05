import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalConversation, LocalRunEvent } from '@buddy-electron/shared/localChatApi'
import type { BuddyPermissionMode } from '@buddy-shared/permissionMode'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeRecoveryStore } from '@/stores/useRuntimeRecoveryStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { ChatBlockerKind } from '@/workbenches/chat/workspace/chatBlocker'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from '@buddy-shared/attachmentPolicy'
import { useDebounceFn } from '@vueuse/core'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import { useChatComposerInteractions } from '@/workbenches/chat/composer/useChatComposerInteractions'
import { useChatApprovals } from '@/workbenches/chat/state/useChatApprovals'
import { useChatContextUsage } from '@/workbenches/chat/state/useChatContextUsage'
import { useChatConversations } from '@/workbenches/chat/state/useChatConversations'
import { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import { useChatExecution } from '@/workbenches/chat/state/useChatExecution'
import { useChatPermissionSettings } from '@/workbenches/chat/state/useChatPermissionSettings'
import { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import { useChatSession } from '@/workbenches/chat/state/useChatSession'
import {
  reconcileDismissedChatBlocker,
  resolveChatBlocker,
} from '@/workbenches/chat/workspace/chatBlocker'
import { useTaskIndexData } from '@/workbenches/tasks/state/useTaskIndexData'
import { useTaskSpaces } from '@/workbenches/tasks/state/useTaskSpaces'
import { useTaskWorkspacePersistence } from '@/workbenches/tasks/state/useTaskWorkspacePersistence'

const CONVERSATION_ACTIVITY_EVENT_TYPES = new Set([
  'approval.requested',
  'approval.resolved',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'run.started',
])

export interface UseTaskCapabilityOptions {
  api: LexoraDesktopApi
  applicationSettings: ApplicationSettingsStore
  localCapabilities: LocalCapabilitiesStore
  modelProviders: ModelProvidersStore
  runtimeRecovery: RuntimeRecoveryStore
  runtimeSupervisor: RuntimeSupervisorStore
}

export function useTaskCapability(options: UseTaskCapabilityOptions) {
  const {
    api,
    applicationSettings,
    localCapabilities,
    modelProviders,
    runtimeRecovery,
    runtimeSupervisor,
  } = options
  const taskIndexData = useTaskIndexData({ api: api.localChat })
  const {
    conversations,
    spaces,
    refreshIndex: refreshTaskIndex,
    refreshConversations,
  } = taskIndexData
  const chatSession = useChatSession()
  const {
    activeBranchId,
    activeConversationId,
    branches,
    spaceId,
  } = chatSession
  const isLoading = shallowRef(true)
  const isSelectingFiles = shallowRef(false)
  const errorMessage = shallowRef<string | null>(null)
  const dismissedChatBlockerKind = shallowRef<ChatBlockerKind | null>(null)
  let resolveInitialLoad: () => void
  const initialLoad = new Promise<void>((resolve) => {
    resolveInitialLoad = resolve
  })
  let hasCompletedInitialLoad = false
  let isDisposed = false

  const { language } = applicationSettings
  const welcomePreference = computed(() => (
    applicationSettings.config.value?.desktop.welcomeVariant ?? 'random'
  ))
  const { t } = useBuddyI18n(language)
  const getRunTerminationMessage = (errorCode: string | null) =>
    errorCode === 'SESSION_STORAGE_UNAVAILABLE'
      ? t('desktop.chat.sessionStorageUnavailable')
      : t('desktop.chat.runTerminated')
  const runSync = useChatRunSync({
    activeBranchId,
    activeConversationId,
    api: api.localChat,
    onError: setError,
  })
  const {
    approvals,
    changeSets,
    hasOlderMessages,
    isLoadingOlderMessages,
    messages,
    runEventBuckets,
    runSignalEvents,
    runOutputs,
    runs,
    timelineItems,
  } = runSync

  const activeRun = computed(() => runs.value.find(
    run => run.status === 'queued' || run.status === 'running',
  ) ?? null)
  const hasAvailableProvider = computed(() => modelProviders.providers.value.some(
    provider => provider.enabled && provider.status === 'available',
  ))
  const chatBlocker = computed(() => resolveChatBlocker({
    hasAvailableProvider: hasAvailableProvider.value,
    hasSelectedModel: modelProviders.selectedModel.value !== null,
    runtimeError: runtimeSupervisor.runtimeError.value,
    runtimeStatus: runtimeSupervisor.runtimeState.value.status,
  }))
  const visibleChatBlocker = computed(() => (
    chatBlocker.value?.kind === dismissedChatBlockerKind.value ? null : chatBlocker.value
  ))
  const draftScopeKey = computed(() => activeConversationId.value
    ? `conversation:${activeConversationId.value}`
    : spaceId.value ? `space:${spaceId.value}` : 'global')
  let persistDraftChanges = () => {}
  const drafts = useChatDrafts({
    cleanupDraftAttachments: () => api.localChat.attachments.cleanupDrafts(),
    onChange: () => persistDraftChanges(),
    releaseAttachments: attachmentIds => api.localChat.attachments.release(attachmentIds),
    targetKey: draftScopeKey,
  })
  const { attachments, composerContent, draft, draftId } = drafts
  const workspacePersistence = useTaskWorkspacePersistence({
    api: api.localChat.workspaceState,
    conversations,
    drafts,
    onError: setError,
    spaces,
    session: chatSession,
  })
  const persistWorkspaceState = workspacePersistence.persist
  persistDraftChanges = workspacePersistence.persistIfHydrated
  const {
    activateDraftScope,
    activateGlobalDraft,
    activeConversation,
    applyConversation,
    deleteConversation,
    listActiveConversationMessages,
    openConversation,
    refreshBranches,
    renameConversation,
  } = useChatConversations({
    api: api.localChat,
    taskIndexData,
    clearError: () => errorMessage.value = null,
    drafts,
    onError: setError,
    persistWorkspaceState,
    restoreConversationModelSelection: modelProviders.restoreConversationModelSelection,
    runSync,
    selectDefaultModel: modelProviders.selectDefaultModel,
    session: chatSession,
  })
  const taskSpaces = useTaskSpaces({
    activateDraftScope,
    api: api.localChat,
    drafts,
    localCapabilities,
    onError: setError,
    persistWorkspaceState,
    spaceId,
    spaces,
    refreshIndex: refreshTaskIndex,
    selectDefaultModel: modelProviders.selectDefaultModel,
  })
  const {
    activeSpace,
    createSpace,
    deleteSpace,
    listContextOptions,
    activateSpaceDraft,
    selectSpaceDirectory,
    updateSpace,
  } = taskSpaces
  const currentTitle = computed(() => activeConversation.value?.title?.trim()
    || t('desktop.tasks.newTask'))
  const permissionSettingsState = useChatPermissionSettings({
    activeConversation,
    activeConversationId,
    activeRun,
    api: api.localChat.conversations,
    taskIndexData,
    drafts,
    onError: setError,
    persistWorkspaceState,
  })
  const {
    approvalViews,
    resolveApproval,
    resolvingApprovalActions,
    resolvingApprovalIds,
  } = useChatApprovals({
    api: api.localChat,
    approvals,
    onError: setError,
    refresh: runSync.refreshActiveConversation,
  })
  const scheduleTaskIndexRefresh = useDebounceFn(async () => {
    if (isDisposed)
      return
    try {
      await refreshTaskIndex()
    }
    catch (error) {
      setError(error)
    }
  }, 100)
  const contextUsageTracker = useChatContextUsage({
    activeBranchId,
    activeConversationId,
    approvalPolicy: permissionSettingsState.approvalPolicy,
    api: api.localChat.context,
    draftId,
    executionProfile: permissionSettingsState.executionProfile,
    models: modelProviders.models,
    spaceId,
    runSignalEvents,
    runtimeState: runtimeSupervisor.runtimeState,
    selectedEffort: modelProviders.selectedEffort,
    selectedModel: modelProviders.selectedModel,
    selectedServiceTier: modelProviders.selectedServiceTier,
  })
  const { contextUsage } = contextUsageTracker
  const composerInteractions = useChatComposerInteractions({ runs })
  const execution = useChatExecution({
    activeRun,
    approvalPolicy: permissionSettingsState.approvalPolicy,
    api: api.localChat,
    taskIndexData,
    session: chatSession,
    drafts,
    draftScopeKey,
    executionProfile: permissionSettingsState.executionProfile,
    getRunTerminationMessage,
    isUpdatingPermissionSettings: permissionSettingsState.isUpdating,
    language,
    persistWorkspaceState,
    modelProviders,
    onActionCommandRunStarted: composerInteractions.trackActionCommand,
    refreshBranches,
    runSync,
    setErrorMessage: message => errorMessage.value = message,
    runtimeSupervisor,
    unavailableCommandMessage: () => t('desktop.chat.commandUnavailable'),
  })
  const {
    activateBranch,
    canMutateBranch,
    canSend,
    cancelActiveRun,
    editUserMessage,
    isMutatingBranch,
    isSending,
    regenerateAssistant,
    send,
  } = execution
  const canUpdatePermissionSettings = computed(() => (
    permissionSettingsState.canUpdate.value
    && !isSending.value
    && !isMutatingBranch.value
  ))

  async function persistConversationModelSelection(
    conversationId: string | null,
    modelSelection: NonNullable<LocalConversation['modelSelection']> | null,
  ): Promise<boolean> {
    if (!conversationId || !modelSelection)
      return true
    try {
      const conversation = await api.localChat.conversations.setModelSelection(
        conversationId,
        modelSelection,
      )
      applyConversation(conversation)
      return true
    }
    catch (error) {
      setError(error)
      return false
    }
  }

  function currentModelSelection(): NonNullable<LocalConversation['modelSelection']> | null {
    const model = modelProviders.selectedModel.value
    return model
      ? {
          modelId: model.modelId,
          providerId: model.providerId,
          reasoning: modelProviders.selectedEffort.value,
          serviceTier: modelProviders.selectedServiceTier.value,
        }
      : null
  }

  async function selectChatModel(value: string) {
    const conversationId = activeConversationId.value
    const persistDefault = modelProviders.selectModel(value)
    if (modelProviders.selectedModelId.value !== value) {
      await persistDefault
      return
    }
    const modelSelection = currentModelSelection()
    await persistDefault
    await persistConversationModelSelection(conversationId, modelSelection)
  }

  async function setChatEffort(value: Parameters<ModelProvidersStore['setSelectedEffort']>[0]) {
    const conversationId = activeConversationId.value
    const persistDefault = modelProviders.setSelectedEffort(value)
    const modelSelection = currentModelSelection()
    await persistDefault
    await persistConversationModelSelection(conversationId, modelSelection)
  }

  async function setChatServiceTier(
    value: Parameters<ModelProvidersStore['setSelectedServiceTier']>[0],
  ) {
    const conversationId = activeConversationId.value
    modelProviders.setSelectedServiceTier(value)
    await persistConversationModelSelection(conversationId, currentModelSelection())
  }

  async function setPermissionMode(value: BuddyPermissionMode): Promise<boolean> {
    if (!canUpdatePermissionSettings.value)
      return false
    return permissionSettingsState.setPermissionMode(value)
  }
  const stopRunEventListener = api.localChat.chat.onRunEvent(handleRunEvent)

  watch(chatBlocker, (value) => {
    dismissedChatBlockerKind.value = reconcileDismissedChatBlocker(
      dismissedChatBlockerKind.value,
      value,
    )
  })

  async function initialize() {
    isLoading.value = true
    errorMessage.value = null
    try {
      const results = await Promise.allSettled([
        api.localChat.spaces.list(),
        refreshConversations(),
        workspacePersistence.read(),
      ])
      if (results[0]?.status === 'fulfilled')
        taskIndexData.replaceSpaces(results[0].value)
      const workspaceResult = results[2]
      if (workspaceResult?.status === 'fulfilled')
        await workspacePersistence.hydrate(workspaceResult.value)
      if (activeConversationId.value) {
        modelProviders.restoreConversationModelSelection(
          activeConversation.value?.modelSelection ?? null,
        )
        await Promise.all([
          refreshBranches(),
          runSync.refreshActiveConversation(),
        ])
      }
      const rejected = results.find(result => result.status === 'rejected')
      if (rejected?.status === 'rejected')
        errorMessage.value = resolveLocalChatErrorMessage(rejected.reason, language.value)
    }
    finally {
      isLoading.value = false
      if (!hasCompletedInitialLoad) {
        hasCompletedInitialLoad = true
        resolveInitialLoad()
      }
    }
  }

  async function refreshRuntimeDependentState() {
    await Promise.all([
      modelProviders.loadModelCatalog(true),
      refreshTaskIndex(),
    ])
    if (activeConversationId.value) {
      const conversation = conversations.value.find(item => item.id === activeConversationId.value)
      chatSession.setActiveBranch(conversation?.activeBranchId ?? null)
      modelProviders.restoreConversationModelSelection(conversation?.modelSelection ?? null)
      await Promise.all([
        refreshBranches(),
        runSync.refreshActiveConversation(),
      ])
    }
  }

  function handleRunEvent(event: LocalRunEvent) {
    runSync.handleRunEvent(event)
    if (!CONVERSATION_ACTIVITY_EVENT_TYPES.has(event.type))
      return
    void scheduleTaskIndexRefresh()
  }

  async function selectAttachments() {
    await initialLoad
    const remainingCount = BUDDY_ATTACHMENT_COUNT_LIMIT - attachments.value.length
    if (remainingCount <= 0) {
      errorMessage.value = t('desktop.chat.attachmentLimit')
      return
    }
    isSelectingFiles.value = true
    try {
      const rejected = await drafts.appendAttachments(
        await api.localChat.attachments.selectFiles({
          draftId: draftId.value,
          remainingCount,
        }),
      )
      if (rejected)
        errorMessage.value = t('desktop.chat.attachmentLimit')
    }
    catch (error) {
      setError(error)
    }
    finally {
      isSelectingFiles.value = false
    }
  }

  async function importAttachments(files: ReadonlyArray<File>) {
    await initialLoad
    const remainingCount = BUDDY_ATTACHMENT_COUNT_LIMIT - attachments.value.length
    if (remainingCount <= 0) {
      errorMessage.value = t('desktop.chat.attachmentLimit')
      return
    }
    isSelectingFiles.value = true
    try {
      const selectedFiles = files.slice(0, remainingCount)
      const rejected = await drafts.appendAttachments(
        await api.localChat.attachments.importFiles({
          draftId: draftId.value,
          files: await Promise.all(selectedFiles.map(async file => ({
            bytes: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
            name: file.name,
          }))),
        }),
      )
      if (selectedFiles.length < files.length || rejected)
        errorMessage.value = t('desktop.chat.attachmentLimit')
    }
    catch (error) {
      setError(error)
    }
    finally {
      isSelectingFiles.value = false
    }
  }

  function setError(error: unknown) {
    errorMessage.value = resolveLocalChatErrorMessage(error, language.value)
  }

  function dispose() {
    isDisposed = true
    contextUsageTracker.dispose()
    stopRunEventListener()
    runSync.dispose()
  }

  function dismissChatBlocker() {
    if (visibleChatBlocker.value?.dismissible)
      dismissedChatBlockerKind.value = visibleChatBlocker.value.kind
  }

  async function startTask(spaceId: string | null): Promise<void> {
    if (spaceId === null) {
      await activateGlobalDraft()
      return
    }
    await activateSpaceDraft(spaceId)
  }

  const index = {
    createSpace,
    deleteSpace,
    deleteTask: deleteConversation,
    spaces: readonly(spaces),
    refresh: refreshTaskIndex,
    renameTask: renameConversation,
    selectSpaceDirectory,
    tasks: readonly(conversations),
    updateSpace,
  } as const

  const session = {
    activeSpace: readonly(activeSpace),
    activeTask: readonly(activeConversation),
    activeTaskId: readonly(activeConversationId),
    currentTitle: readonly(currentTitle),
    openTask: openConversation,
    spaceId: readonly(spaceId),
    startTask,
  } as const

  const chatWorkspaceSession = {
    activeBranchId: readonly(activeBranchId),
    activeConversation: readonly(activeConversation),
    activeConversationId: readonly(activeConversationId),
    activeSpace: readonly(activeSpace),
    currentTitle: readonly(currentTitle),
    listActiveConversationMessages,
    openConversation,
    spaceId: readonly(spaceId),
  } as const

  const workspace = {
    context: {
      getChangeSet: api.localChat.changes.get,
      readArtifactText: api.localChat.artifacts.readText,
    },
    composer: {
      attachments: readonly(attachments),
      composerContent: readonly(composerContent),
      contextUsage: readonly(contextUsage),
      dismissInteraction: composerInteractions.dismissInteraction,
      draft: readonly(draft),
      canUpdatePermissionSettings: readonly(canUpdatePermissionSettings),
      isUpdatingPermissionSettings: permissionSettingsState.isUpdating,
      isSelectingFiles: readonly(isSelectingFiles),
      importAttachments,
      interaction: composerInteractions.interaction,
      listContextOptions,
      models: modelProviders.models,
      providers: modelProviders.providers,
      removeAttachment: drafts.removeAttachment,
      selectedEffort: modelProviders.selectedEffort,
      selectedModel: modelProviders.selectedModelOption,
      selectedModelId: modelProviders.selectedModelId,
      selectedServiceTier: modelProviders.selectedServiceTier,
      selectAttachments,
      selectModel: selectChatModel,
      setSelectedEffort: setChatEffort,
      setSelectedServiceTier: setChatServiceTier,
      permissionMode: permissionSettingsState.permissionMode,
      setPermissionMode,
      updateComposerContent: drafts.updateComposerContent,
    },
    execution: {
      activeRun: readonly(activeRun),
      approvalViews: readonly(approvalViews),
      canMutateBranch: readonly(canMutateBranch),
      canSend: readonly(canSend),
      cancelActiveRun,
      editUserMessage,
      isMutatingBranch: readonly(isMutatingBranch),
      isSending: readonly(isSending),
      regenerateAssistant,
      resolveApproval,
      resolvingApprovalActions: readonly(resolvingApprovalActions),
      resolvingApprovalIds: readonly(resolvingApprovalIds),
      send,
    },
    language,
    session: chatWorkspaceSession,
    welcomePreference: readonly(welcomePreference),
    status: {
      canRestartRuntime: runtimeRecovery.canRestartRuntime,
      dismissChatBlocker,
      errorMessage: readonly(errorMessage),
      isLoading: readonly(isLoading),
      restartRuntime: runtimeSupervisor.restartRuntime,
      runtimeError: runtimeSupervisor.runtimeError,
      runtimeState: runtimeSupervisor.runtimeState,
      visibleChatBlocker: readonly(visibleChatBlocker),
    },
    transcript: {
      activateBranch,
      branches: readonly(branches),
      changeSets: readonly(changeSets),
      hasOlderMessages: readonly(hasOlderMessages),
      isLoadingOlderMessages: readonly(isLoadingOlderMessages),
      loadOlderMessages: runSync.loadOlderMessages,
      messages: readonly(messages),
      runEventBuckets: readonly(runEventBuckets),
      runSignalEvents: readonly(runSignalEvents),
      runOutputs: readonly(runOutputs),
      runs: readonly(runs),
      timelineItems: readonly(timelineItems),
    },
  } as const

  return {
    dispose,
    index,
    initialize,
    language,
    refreshRuntimeDependentState,
    session,
    workspace,
  }
}

export type TaskCapability = ReturnType<typeof useTaskCapability>
export type TaskChatWorkspace = TaskCapability['workspace']
