import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalConversation, LocalRunEvent } from '@buddy-electron/shared/localChatApi'
import type { BuddyPermissionMode } from '@buddy-shared/permissionMode'
import type { JSONContent } from '@tiptap/core'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { ChatBlockerKind } from '@/workbenches/chat/workspace/chatBlocker'
import { useDebounceFn } from '@vueuse/core'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import { resolveChatComposerModelInputIssue } from '@/workbenches/chat/composer/chatComposerModelCapability'
import { getChatComposerResourceIds } from '@/workbenches/chat/composer/chatComposerResourceReferences'
import { useChatComposerInteractions } from '@/workbenches/chat/composer/useChatComposerInteractions'
import { useComposerResources } from '@/workbenches/chat/composer/useComposerResources'
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
  runtimeSupervisor: RuntimeSupervisorStore
}

export function useTaskCapability(options: UseTaskCapabilityOptions) {
  const {
    api,
    applicationSettings,
    localCapabilities,
    modelProviders,
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
  const draftScopeKey = computed(() => activeConversationId.value && activeBranchId.value
    ? `conversation:${activeConversationId.value}:${activeBranchId.value}`
    : spaceId.value ? `space:${spaceId.value}` : 'global')
  let persistDraftChanges = () => {}
  const drafts = useChatDrafts({
    onChange: () => persistDraftChanges(),
    targetKey: draftScopeKey,
  })
  const { composerContent, draft, draftId } = drafts
  const composerResources = useComposerResources({
    api: api.localChat.composerResources,
    draftId,
    getReferencedIds: drafts.resourceIdsForDraft,
    onError: setError,
    onLimitExceeded: () => errorMessage.value = t('desktop.chat.attachmentLimit'),
    onRejected: drafts.rejectResources,
  })
  watch(draftId, (id) => {
    if (getChatComposerResourceIds(composerContent.value as JSONContent | null).length)
      void composerResources.restore(id).catch(setError)
  }, { immediate: true })
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
  const workspacePersistence = useTaskWorkspacePersistence({
    beforePersist: composerResources.whenAccepted,
    api: api.localChat,
    conversations,
    drafts,
    getConversation: id => activeConversation.value?.id === id
      ? activeConversation.value
      : conversations.value.find(conversation => conversation.id === id) ?? null,
    onError: setError,
    spaces,
    session: chatSession,
  })
  persistDraftChanges = workspacePersistence.persistIfHydrated
  function persistWorkspaceState() {
    return workspacePersistence.persist()
  }
  const taskSpaces = useTaskSpaces({
    activateDraftScope,
    activeBranchId,
    activeConversationId,
    api: api.localChat,
    drafts,
    draftId,
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
    applyConversation,
    api: api.localChat.conversations,
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
  const composerModelInputIssue = computed(() => resolveChatComposerModelInputIssue({
    model: modelProviders.selectedModelOption.value,
    resourceIds: getChatComposerResourceIds(composerContent.value as JSONContent),
    resources: composerResources.resources.value,
  }))
  const composerInteractions = useChatComposerInteractions({ runs })
  const execution = useChatExecution({
    activeRun,
    approvalPolicy: permissionSettingsState.approvalPolicy,
    api: api.localChat,
    canSendDraft: computed(() => composerModelInputIssue.value === null),
    taskIndexData,
    session: chatSession,
    drafts,
    draftScopeKey,
    draftChangedMessage: () => t('desktop.chat.draftChanged'),
    executionProfile: permissionSettingsState.executionProfile,
    getRunTerminationMessage,
    isUpdatingPermissionSettings: permissionSettingsState.isUpdating,
    language,
    persistWorkspaceState,
    modelProviders,
    onActionCommandRunStarted: composerInteractions.trackActionCommand,
    refreshBranches,
    selectComposerSource: composerResources.selectSource,
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
    cancelEditUserMessage,
    editUserMessage,
    editingMessageId,
    isMutatingBranch,
    isSending,
    regenerateAssistant,
    send,
    submitEditedMessage,
  } = execution
  const canUpdatePermissionSettings = computed(() => (
    permissionSettingsState.canUpdate.value
    && !isSending.value
    && !isMutatingBranch.value
  ))
  let conversationModelPersistenceRevision = 0
  let conversationModelPersistenceQueue = Promise.resolve(true)

  function persistConversationModelSelection(
    conversationId: string | null,
    modelSelection: NonNullable<LocalConversation['modelSelection']> | null,
  ): Promise<boolean> {
    if (!conversationId || !modelSelection)
      return Promise.resolve(true)
    const revision = ++conversationModelPersistenceRevision
    const operation = async () => {
      try {
        const conversation = await api.localChat.conversations.setModelSelection(
          conversationId,
          modelSelection,
        )
        if (revision === conversationModelPersistenceRevision)
          applyConversation(conversation)
        return true
      }
      catch (error) {
        if (revision === conversationModelPersistenceRevision)
          setError(error)
        return false
      }
    }
    conversationModelPersistenceQueue = conversationModelPersistenceQueue.then(
      operation,
      operation,
    )
    return conversationModelPersistenceQueue
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

  watch(
    () => [
      modelProviders.selectedModel.value?.providerId ?? null,
      modelProviders.selectedModel.value?.modelId ?? null,
      modelProviders.selectedEffort.value,
      modelProviders.selectedServiceTier.value,
    ] as const,
    () => drafts.setModelSelection(currentModelSelection()),
    { flush: 'sync', immediate: true },
  )

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
    const source = drafts.load(draftScopeKey.value)
    await initialLoad
    if (draftId.value !== source.draftId || !drafts.isEditorSessionCurrent(source))
      return
    isSelectingFiles.value = true
    try {
      const resourceIds = await composerResources.selectFiles(source.draftId)
      if (resourceIds.length)
        drafts.appendResourcePanel(source.draftId, resourceIds, source.editorSessionId)
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
    workspacePersistence.dispose()
    contextUsageTracker.dispose()
    stopRunEventListener()
    runSync.dispose()
  }

  function flushDrafts(): Promise<boolean> {
    return workspacePersistence.flushPending()
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
      composerContent,
      contextUsage: readonly(contextUsage),
      dismissInteraction: composerInteractions.dismissInteraction,
      draft: readonly(draft),
      draftId: readonly(draftId),
      editorKey: readonly(drafts.editorKey),
      resources: composerResources.resources,
      rejectedResourceIds: composerResources.rejectedIds,
      beginImport: (files: readonly File[]) => hasCompletedInitialLoad ? composerResources.begin(files) : [],
      selectSource: composerResources.selectSource,
      retryResource: composerResources.retry,
      canUpdatePermissionSettings: readonly(canUpdatePermissionSettings),
      isUpdatingPermissionSettings: permissionSettingsState.isUpdating,
      isSelectingFiles: readonly(isSelectingFiles),
      interaction: composerInteractions.interaction,
      listContextOptions,
      models: modelProviders.models,
      providers: modelProviders.providers,
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
      cancelEditUserMessage,
      editUserMessage,
      editingMessageId,
      isMutatingBranch: readonly(isMutatingBranch),
      isSending: readonly(isSending),
      regenerateAssistant,
      resolveApproval,
      resolvingApprovalActions: readonly(resolvingApprovalActions),
      resolvingApprovalIds: readonly(resolvingApprovalIds),
      send,
      submitEditedMessage,
    },
    language,
    session: chatWorkspaceSession,
    welcomePreference: readonly(welcomePreference),
    status: {
      canRestartRuntime: runtimeSupervisor.canRestartRuntime,
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
    flushDrafts,
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
