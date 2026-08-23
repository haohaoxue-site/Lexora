import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalRunEvent } from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeRecoveryStore } from '@/stores/useRuntimeRecoveryStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { ChatBlockerKind } from '@/workbenches/chat/workspace/chatBlocker'
import { useDebounceFn } from '@vueuse/core'
import { computed, readonly, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'
import { useChatApprovals } from '@/workbenches/chat/state/useChatApprovals'
import { useChatContextUsage } from '@/workbenches/chat/state/useChatContextUsage'
import { useChatConversations } from '@/workbenches/chat/state/useChatConversations'
import { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import { useChatExecution } from '@/workbenches/chat/state/useChatExecution'
import { useChatExecutionProfile } from '@/workbenches/chat/state/useChatExecutionProfile'
import { useChatIndexData } from '@/workbenches/chat/state/useChatIndexData'
import { useChatProjects } from '@/workbenches/chat/state/useChatProjects'
import { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import { useChatSession } from '@/workbenches/chat/state/useChatSession'
import { useChatWorkspacePersistence } from '@/workbenches/chat/state/useChatWorkspacePersistence'
import {
  reconcileDismissedChatBlocker,
  resolveChatBlocker,
} from '@/workbenches/chat/workspace/chatBlocker'

const CONVERSATION_ACTIVITY_EVENT_TYPES = new Set([
  'approval.requested',
  'approval.resolved',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'run.started',
])

export interface UseChatCapabilityOptions {
  api: LexoraDesktopApi
  applicationSettings: ApplicationSettingsStore
  localCapabilities: LocalCapabilitiesStore
  modelProviders: ModelProvidersStore
  runtimeRecovery: RuntimeRecoveryStore
  runtimeSupervisor: RuntimeSupervisorStore
}

export function useChatCapability(options: UseChatCapabilityOptions) {
  const {
    api,
    applicationSettings,
    localCapabilities,
    modelProviders,
    runtimeRecovery,
    runtimeSupervisor,
  } = options
  const chatIndexData = useChatIndexData({ api: api.localChat })
  const {
    conversations,
    projects,
    refreshIndex: refreshChatIndex,
    refreshConversations,
  } = chatIndexData
  const chatSession = useChatSession()
  const {
    activeBranchId,
    activeConversationId,
    branches,
    projectId,
  } = chatSession
  const isLoading = shallowRef(true)
  const isSelectingFiles = shallowRef(false)
  const errorMessage = shallowRef<string | null>(null)
  const dismissedChatBlockerKind = shallowRef<ChatBlockerKind | null>(null)
  let isDisposed = false

  const { language } = applicationSettings
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
    hasOlderMessages,
    isLoadingOlderMessages,
    messages,
    runEvents,
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
    : projectId.value ? `project:${projectId.value}` : 'global')
  let persistDraftChanges = () => {}
  const drafts = useChatDrafts({
    cleanupDraftAttachments: retainedAttachmentIds =>
      api.localChat.attachments.cleanupDrafts(retainedAttachmentIds),
    onChange: () => persistDraftChanges(),
    releaseAttachments: attachmentIds => api.localChat.attachments.release(attachmentIds),
    targetKey: draftScopeKey,
  })
  const { attachments, composerContent, draft } = drafts
  const workspacePersistence = useChatWorkspacePersistence({
    api: api.localChat.workspaceState,
    conversations,
    drafts,
    onError: setError,
    projects,
    session: chatSession,
  })
  const persistWorkspaceState = workspacePersistence.persist
  persistDraftChanges = workspacePersistence.persistIfHydrated
  const {
    activateDraftScope,
    activeConversation,
    deleteConversation,
    listActiveConversationMessages,
    openConversation,
    refreshBranches,
    renameConversation,
    startGlobalConversation,
  } = useChatConversations({
    api: api.localChat,
    chatIndexData,
    clearError: () => errorMessage.value = null,
    drafts,
    onError: setError,
    persistWorkspaceState,
    runSync,
    selectDefaultModel: modelProviders.selectDefaultModel,
    session: chatSession,
  })
  const chatProjects = useChatProjects({
    activateDraftScope,
    api: api.localChat,
    drafts,
    localCapabilities,
    onError: setError,
    persistWorkspaceState,
    projectId,
    projects,
    refreshIndex: refreshChatIndex,
    selectDefaultModel: modelProviders.selectDefaultModel,
  })
  const {
    activeProject,
    createProject,
    deleteProject,
    listContextOptions,
    startProjectConversation,
    updateProject,
  } = chatProjects
  const currentTitle = computed(() => activeConversation.value?.title?.trim()
    || activeProject.value?.name
    || t('chat.newConversation'))
  const executionProfileState = useChatExecutionProfile({
    activeConversation,
    activeConversationId,
    activeRun,
    api: api.localChat.conversations,
    chatIndexData,
    drafts,
    onError: setError,
    persistWorkspaceState,
  })
  const { approvalViews, resolveApproval, resolvingApprovalIds } = useChatApprovals({
    api: api.localChat,
    approvals,
    onError: setError,
    refresh: runSync.refreshActiveConversation,
  })
  const scheduleChatIndexRefresh = useDebounceFn(async () => {
    if (isDisposed)
      return
    try {
      await refreshChatIndex()
    }
    catch (error) {
      setError(error)
    }
  }, 100)
  const contextUsageTracker = useChatContextUsage({
    activeBranchId,
    activeConversationId,
    api: api.localChat.context,
    executionProfile: executionProfileState.executionProfile,
    models: modelProviders.models,
    projectId,
    runEvents,
    runtimeState: runtimeSupervisor.runtimeState,
    selectedEffort: modelProviders.selectedEffort,
    selectedModel: modelProviders.selectedModel,
    selectedServiceTier: modelProviders.selectedServiceTier,
  })
  const { contextUsage } = contextUsageTracker
  const execution = useChatExecution({
    activeRun,
    api: api.localChat,
    chatIndexData,
    session: chatSession,
    drafts,
    draftScopeKey,
    executionProfile: executionProfileState.executionProfile,
    getRunTerminationMessage,
    isUpdatingExecutionProfile: executionProfileState.isUpdating,
    language,
    persistWorkspaceState,
    modelProviders,
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
  const canUpdateExecutionProfile = computed(() => (
    executionProfileState.canUpdate.value
    && !isSending.value
    && !isMutatingBranch.value
  ))

  async function setExecutionProfile(value: BuddyExecutionProfile): Promise<boolean> {
    if (!canUpdateExecutionProfile.value)
      return false
    return executionProfileState.setExecutionProfile(value)
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
    const results = await Promise.allSettled([
      api.localChat.projects.list(),
      refreshConversations(),
      workspacePersistence.read(),
    ])
    if (results[0]?.status === 'fulfilled')
      chatIndexData.replaceProjects(results[0].value)
    const workspaceResult = results[2]
    if (workspaceResult?.status === 'fulfilled')
      await workspacePersistence.hydrate(workspaceResult.value)
    if (activeConversationId.value) {
      await Promise.all([
        refreshBranches(),
        runSync.refreshActiveConversation(),
      ])
    }
    const rejected = results.find(result => result.status === 'rejected')
    if (rejected?.status === 'rejected')
      errorMessage.value = resolveLocalChatErrorMessage(rejected.reason, language.value)
    isLoading.value = false
  }

  async function refreshRuntimeDependentState() {
    await Promise.all([
      modelProviders.loadModelCatalog(true),
      refreshChatIndex(),
    ])
    if (activeConversationId.value) {
      const conversation = conversations.value.find(item => item.id === activeConversationId.value)
      chatSession.setActiveBranch(conversation?.activeBranchId ?? null)
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
    void scheduleChatIndexRefresh()
  }

  async function selectAttachments() {
    const remainingCount = 16 - attachments.value.length
    if (remainingCount <= 0) {
      errorMessage.value = t('desktop.chat.attachmentLimit')
      return
    }
    isSelectingFiles.value = true
    try {
      const rejected = await drafts.appendAttachments(
        await api.localChat.attachments.selectFiles({ remainingCount }),
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

  const index = {
    conversations: readonly(conversations),
    createProject,
    deleteConversation,
    deleteProject,
    projects: readonly(projects),
    renameConversation,
    updateProject,
  } as const

  const session = {
    activeBranchId: readonly(activeBranchId),
    activeConversation: readonly(activeConversation),
    activeConversationId: readonly(activeConversationId),
    activeProject: readonly(activeProject),
    currentTitle: readonly(currentTitle),
    listActiveConversationMessages,
    openConversation,
    projectId: readonly(projectId),
    startGlobalConversation,
    startProjectConversation,
  } as const

  const workspace = {
    composer: {
      attachments: readonly(attachments),
      composerContent: readonly(composerContent),
      contextUsage: readonly(contextUsage),
      draft: readonly(draft),
      executionProfile: executionProfileState.executionProfile,
      canUpdateExecutionProfile: readonly(canUpdateExecutionProfile),
      isUpdatingExecutionProfile: executionProfileState.isUpdating,
      isSelectingFiles: readonly(isSelectingFiles),
      listContextOptions,
      models: modelProviders.models,
      providers: modelProviders.providers,
      removeAttachment: drafts.removeAttachment,
      selectedEffort: modelProviders.selectedEffort,
      selectedModel: modelProviders.selectedModel,
      selectedModelId: modelProviders.selectedModelId,
      selectedServiceTier: modelProviders.selectedServiceTier,
      selectAttachments,
      selectModel: modelProviders.selectModel,
      setSelectedEffort: modelProviders.setSelectedEffort,
      setSelectedServiceTier: modelProviders.setSelectedServiceTier,
      setExecutionProfile,
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
      resolvingApprovalIds: readonly(resolvingApprovalIds),
      send,
    },
    language,
    session,
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
      hasOlderMessages: readonly(hasOlderMessages),
      isLoadingOlderMessages: readonly(isLoadingOlderMessages),
      loadOlderMessages: runSync.loadOlderMessages,
      messages: readonly(messages),
      runEvents: readonly(runEvents),
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

export type ChatCapability = ReturnType<typeof useChatCapability>
export type ChatWorkspace = ChatCapability['workspace']
