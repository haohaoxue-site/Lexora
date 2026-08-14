import type {
  LocalContextUsageSnapshot,
  LocalConversation,
  LocalConversationBranch,
  LocalConversationSummary,
  LocalProject,
  LocalPromptContextItem,
  LocalRunEvent,
  LocalWorkspaceStateValue,
} from '../../electron/shared/localChatApi'
import type { ParsedBuddyChatCommand } from '../../shared/buddyChatCommands'
import type { DesktopChatBlockerKind } from './desktopChatBlocker'
import type {
  DesktopComposerContextOptions,
  DesktopComposerSubmitPayload,
} from './desktopComposerInput'
import { computed, onBeforeUnmount, readonly, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { localWorkspaceStateValueSchema } from '../../electron/shared/localChatApiSchemas'
import { parseBuddyChatCommand } from '../../shared/buddyChatCommands'
import {
  reconcileDismissedDesktopChatBlocker,
  resolveDesktopChatBlocker,
} from './desktopChatBlocker'
import { normalizeDesktopError } from './desktopChatError'
import { createDesktopContextUsage } from './desktopContextUsage'
import { useDesktopApprovals } from './useDesktopApprovals'
import { useDesktopDraft } from './useDesktopDraft'
import { useDesktopNotifications } from './useDesktopNotifications'
import { useDesktopRunSync } from './useDesktopRunSync'
import { useDesktopRuntime } from './useDesktopRuntime'

const CONVERSATION_ACTIVITY_EVENT_TYPES = new Set([
  'approval.requested',
  'approval.resolved',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'run.started',
])

export function useDesktopChat() {
  const api = requireDesktopApi()
  const projects = shallowRef<ReadonlyArray<LocalProject>>([])
  const conversations = shallowRef<ReadonlyArray<LocalConversationSummary>>([])
  const branches = shallowRef<ReadonlyArray<LocalConversationBranch>>([])
  const activeConversationId = shallowRef<string | null>(null)
  const activeBranchId = shallowRef<string | null>(null)
  const projectId = shallowRef<string | null>(null)
  const isLoading = shallowRef(true)
  const isMutatingBranch = shallowRef(false)
  const isSending = shallowRef(false)
  const isSelectingFiles = shallowRef(false)
  const errorMessage = shallowRef<string | null>(null)
  const dismissedChatBlockerKind = shallowRef<DesktopChatBlockerKind | null>(null)
  const contextUsageSnapshot = shallowRef<LocalContextUsageSnapshot | null>(null)
  let hasHydratedDrafts = false
  let conversationActivityRefreshTimer: number | null = null
  let contextUsageRequestId = 0
  let conversationListGeneration = 0
  let navigationGeneration = 0
  let persistTail = Promise.resolve()
  const mutationRequestIds = new Map<string, string>()

  const desktopNotifications = useDesktopNotifications(api.localChat)
  const desktopRuntime = useDesktopRuntime({
    api,
    onCatalogChanged: () => void desktopNotifications.load(),
    onReady: () => void refreshAfterRuntimeReady(),
  })
  const { language } = desktopRuntime
  const { t } = useBuddyI18n(language)
  const runTerminationMessage = (errorCode: string | null) =>
    errorCode === 'SESSION_STORAGE_UNAVAILABLE'
      ? t('desktop.chat.sessionStorageUnavailable')
      : t('desktop.chat.runTerminated')
  const runSync = useDesktopRunSync({
    activeBranchId,
    activeConversationId,
    api: api.localChat,
    onError: error => errorMessage.value = normalizeDesktopError(error, language.value),
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

  const activeConversation = computed(() => conversations.value.find(
    conversation => conversation.id === activeConversationId.value,
  ) ?? null)
  const activeProject = computed(() => projects.value.find(project => project.id === projectId.value) ?? null)
  const activeRun = computed(() => runs.value.find(
    run => run.status === 'queued' || run.status === 'running',
  ) ?? null)
  const contextUsage = computed(() => createDesktopContextUsage({
    events: runEvents.value,
    models: desktopRuntime.models.value,
    selectedModel: desktopRuntime.selectedModel.value,
    snapshot: contextUsageSnapshot.value,
  }))
  const currentCwd = computed(() => activeProject.value?.root ?? null)
  const currentScope = computed(() => activeProject.value ? 'project' as const : 'global' as const)
  const currentTitle = computed(() => activeConversation.value?.title?.trim()
    || activeProject.value?.name
    || t('chat.newConversation'))
  const canSend = computed(() =>
    desktopRuntime.runtimeState.value.status === 'ready'
    && desktopRuntime.selectedModel.value !== null
    && !activeRun.value
    && !isSending.value,
  )
  const canMutateBranch = computed(() =>
    desktopRuntime.runtimeState.value.status === 'ready'
    && activeConversationId.value !== null
    && activeBranchId.value !== null
    && !activeRun.value
    && !isMutatingBranch.value
    && !isSending.value,
  )
  const hasAvailableProvider = computed(() => desktopRuntime.providers.value.some(
    provider => provider.enabled && provider.status === 'available',
  ))
  const chatBlocker = computed(() => resolveDesktopChatBlocker({
    hasAvailableProvider: hasAvailableProvider.value,
    hasSelectedModel: desktopRuntime.selectedModel.value !== null,
    runtimeError: desktopRuntime.runtimeError.value,
    runtimeStatus: desktopRuntime.runtimeState.value.status,
  }))
  const visibleChatBlocker = computed(() => (
    chatBlocker.value?.kind === dismissedChatBlockerKind.value ? null : chatBlocker.value
  ))
  const draftTargetKey = computed(() => activeConversationId.value
    ? `conversation:${activeConversationId.value}`
    : projectId.value ? `project:${projectId.value}` : 'global')
  const desktopDraft = useDesktopDraft({
    cleanupDraftAttachments: retainedAttachmentIds =>
      api.localChat.attachments.cleanupDrafts(retainedAttachmentIds),
    onChange: () => {
      if (hasHydratedDrafts)
        void persistWorkspaceState()
    },
    releaseAttachments: attachmentIds => api.localChat.attachments.release(attachmentIds),
    targetKey: draftTargetKey,
  })
  const { attachments, composerContent, draft } = desktopDraft
  const { approvalViews, resolveApproval, resolvingApprovalIds } = useDesktopApprovals({
    api: api.localChat,
    approvals,
    onError: error => errorMessage.value = normalizeDesktopError(error, language.value),
    refresh: runSync.refreshActiveConversation,
  })
  const stopRunEvents = api.localChat.chat.onRunEvent(handleRunEvent)

  watch(chatBlocker, (value) => {
    dismissedChatBlockerKind.value = reconcileDismissedDesktopChatBlocker(
      dismissedChatBlockerKind.value,
      value,
    )
  })

  watch(
    () => [
      desktopRuntime.runtimeState.value.status,
      desktopRuntime.selectedModel.value?.providerId ?? null,
      desktopRuntime.selectedModel.value?.modelId ?? null,
      desktopRuntime.selectedEffort.value,
      desktopRuntime.selectedServiceTier.value,
      activeConversationId.value,
      activeBranchId.value,
      projectId.value,
    ] as const,
    () => void refreshContextUsageSnapshot(),
    { immediate: true },
  )

  async function initialize() {
    isLoading.value = true
    errorMessage.value = null
    const results = await Promise.allSettled([
      desktopRuntime.initialize(),
      api.localChat.projects.list(),
      refreshConversations(),
      api.localChat.workspaceState.read(),
      desktopNotifications.load(),
    ])
    if (results[1]?.status === 'fulfilled')
      projects.value = results[1].value
    const workspaceResult = results[3]
    const workspace = workspaceResult?.status === 'fulfilled' && workspaceResult.value
      ? localWorkspaceStateValueSchema.safeParse(workspaceResult.value.value)
      : null
    const workspaceHydrated = workspaceResult?.status === 'fulfilled'
      && (workspaceResult.value === null || workspace?.success === true)
    if (workspace?.success) {
      desktopDraft.hydrate(workspace.data.drafts)
      activeConversationId.value = conversations.value.some(
        item => item.id === workspace.data.activeConversationId,
      )
        ? workspace.data.activeConversationId
        : null
      activeBranchId.value = conversations.value.find(
        item => item.id === activeConversationId.value,
      )?.activeBranchId ?? null
      projectId.value = projects.value.some(
        item => item.id === workspace.data.projectId && item.revokedAt === null,
      )
        ? workspace.data.projectId
        : null
    }
    else if (workspaceResult?.status === 'fulfilled' && workspaceResult.value === null) {
      desktopDraft.hydrate([])
    }
    hasHydratedDrafts = workspaceHydrated
    desktopDraft.restoreCurrentDraft()
    if (workspaceHydrated) {
      await desktopDraft.cleanupAbandonedAttachments().catch((error) => {
        errorMessage.value = normalizeDesktopError(error, language.value)
      })
    }
    if (activeConversationId.value) {
      await Promise.all([
        refreshBranches(),
        runSync.refreshActiveConversation(),
      ])
    }
    const rejected = results.find(result => result.status === 'rejected')
    if (rejected?.status === 'rejected')
      errorMessage.value = normalizeDesktopError(rejected.reason, language.value)
    isLoading.value = false
  }

  async function refreshAfterRuntimeReady() {
    await Promise.all([
      desktopRuntime.loadAgent(true),
      refreshCollections(),
    ])
    if (activeConversationId.value) {
      const conversation = conversations.value.find(item => item.id === activeConversationId.value)
      activeBranchId.value = conversation?.activeBranchId ?? null
      await Promise.all([
        refreshBranches(),
        runSync.refreshActiveConversation(),
      ])
    }
  }

  async function refreshContextUsageSnapshot() {
    const requestId = ++contextUsageRequestId
    const selectedModel = desktopRuntime.selectedModel.value
    const conversationId = activeConversationId.value
    const branchId = activeBranchId.value
    if (
      desktopRuntime.runtimeState.value.status !== 'ready'
      || !selectedModel
      || ((conversationId === null) !== (branchId === null))
    ) {
      contextUsageSnapshot.value = null
      return
    }

    contextUsageSnapshot.value = null
    try {
      const snapshot = await api.localChat.context.getUsageSnapshot({
        branchId,
        conversationId,
        modelSelection: {
          modelId: selectedModel.modelId,
          providerId: selectedModel.providerId,
          reasoning: desktopRuntime.selectedEffort.value,
          serviceTier: desktopRuntime.selectedServiceTier.value,
        },
        projectId: projectId.value,
      })
      if (requestId === contextUsageRequestId)
        contextUsageSnapshot.value = snapshot
    }
    catch {
      if (requestId === contextUsageRequestId)
        contextUsageSnapshot.value = null
    }
  }

  async function refreshCollections() {
    const [nextProjects] = await Promise.all([
      api.localChat.projects.list(),
      refreshConversations(),
    ])
    projects.value = nextProjects
  }

  async function refreshConversations() {
    const generation = ++conversationListGeneration
    const nextConversations = await api.localChat.conversations.list()
    if (generation === conversationListGeneration)
      conversations.value = nextConversations
  }

  function handleRunEvent(event: LocalRunEvent) {
    runSync.handleRunEvent(event)
    if (!CONVERSATION_ACTIVITY_EVENT_TYPES.has(event.type) || conversationActivityRefreshTimer !== null)
      return
    conversationActivityRefreshTimer = window.setTimeout(() => {
      conversationActivityRefreshTimer = null
      void refreshCollections().catch((error) => {
        errorMessage.value = normalizeDesktopError(error, language.value)
      })
    }, 100)
  }

  async function refreshBranches() {
    const conversationId = activeConversationId.value
    const generation = navigationGeneration
    if (!conversationId) {
      branches.value = []
      return
    }
    const nextBranches = await api.localChat.conversations.listBranches(conversationId)
    if (generation === navigationGeneration && conversationId === activeConversationId.value)
      branches.value = nextBranches
  }

  async function openConversation(conversationId: string) {
    const conversation = conversations.value.find(item => item.id === conversationId)
    if (!conversation)
      return
    navigationGeneration += 1
    desktopDraft.saveCurrentDraft()
    activeConversationId.value = conversation.id
    activeBranchId.value = conversation.activeBranchId
    branches.value = []
    projectId.value = conversation.projectId
    desktopDraft.restoreCurrentDraft()
    await persistWorkspaceState()
    await Promise.all([
      refreshBranches(),
      runSync.refreshActiveConversation(),
    ])
  }

  async function startGlobalConversation() {
    switchDraftTarget(null)
    desktopRuntime.selectDefaultModel()
    await persistWorkspaceState()
  }

  async function startProjectConversation(nextProjectId: string) {
    const project = projects.value.find(item => item.id === nextProjectId && item.revokedAt === null)
    if (!project)
      return
    switchDraftTarget(project.id)
    desktopRuntime.selectDefaultModel()
    await persistWorkspaceState()
  }

  async function createProject(input: {
    instructions: string
    memoryScope: 'personal_and_project' | 'project_only'
    name: string
    root: string | null
  }) {
    try {
      const project = await api.localChat.projects.create(input)
      await refreshCollections()
      await startProjectConversation(project.id)
      return true
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function updateProject(input: {
    instructions: string
    memoryScope: 'personal_and_project' | 'project_only'
    name: string
    projectId: string
    root: string | null
  }) {
    try {
      await api.localChat.projects.update(input)
      await refreshCollections()
      if (projectId.value === input.projectId)
        await desktopRuntime.loadSkills(input.projectId)
      return true
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function deleteProject(nextProjectId: string) {
    try {
      await api.localChat.projects.delete(nextProjectId)
      await desktopDraft.discard(`project:${nextProjectId}`)
      if (projectId.value === nextProjectId)
        switchDraftTarget(null, false)
      await refreshCollections()
      await persistWorkspaceState()
      return true
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function deleteConversation(conversationId: string) {
    try {
      await api.localChat.conversations.delete(conversationId)
      await desktopDraft.discard(`conversation:${conversationId}`)
      if (activeConversationId.value === conversationId)
        switchDraftTarget(null, false)
      await refreshCollections()
      await persistWorkspaceState()
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
    }
  }

  async function renameConversation(conversationId: string, title: string) {
    try {
      const conversation = await api.localChat.conversations.rename(conversationId, title)
      applyActiveConversation(conversation)
      return true
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function listActiveConversationMessages() {
    const conversationId = activeConversationId.value
    const branchId = activeBranchId.value
    if (!conversationId || !branchId)
      return []

    try {
      let cursor: string | undefined
      let allMessages = [] as typeof messages.value
      do {
        const page = await api.localChat.conversations.listMessages({
          branchId,
          conversationId,
          cursor,
          limit: 500,
        })
        if (
          conversationId !== activeConversationId.value
          || branchId !== activeBranchId.value
        ) {
          return []
        }
        allMessages = [...page.items, ...allMessages]
        cursor = page.nextCursor ?? undefined
      } while (cursor)

      return allMessages
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
      return []
    }
  }

  async function activateBranch(branchId: string) {
    const conversationId = activeConversationId.value
    if (!conversationId || !canMutateBranch.value)
      return false
    if (branchId === activeBranchId.value)
      return true
    if (!branches.value.some(branch => branch.id === branchId))
      return false

    const sourceNavigationGeneration = navigationGeneration
    const ownsSourceView = () => sourceNavigationGeneration === navigationGeneration
      && activeConversationId.value === conversationId
    isMutatingBranch.value = true
    errorMessage.value = null
    try {
      const conversation = await api.localChat.conversations.activateBranch({
        branchId,
        conversationId,
      })
      if (!ownsSourceView()) {
        void refreshCollections().catch(() => {})
        return true
      }
      applyActiveConversation(conversation)
      activeBranchId.value = conversation.activeBranchId
      await refreshAcceptedBranchState(conversationId)
      return true
    }
    catch (error) {
      if (ownsSourceView())
        errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function editUserMessage(userMessageId: string, content: string) {
    const conversationId = activeConversationId.value
    const parentBranchId = activeBranchId.value
    const sourceMessage = messages.value.find(message => message.id === userMessageId)
    const selectedModel = desktopRuntime.selectedModel.value
    if (
      !conversationId
      || !parentBranchId
      || sourceMessage?.role !== 'user'
      || !selectedModel
      || !canMutateBranch.value
    ) {
      return false
    }
    const sourceIndex = messages.value.findIndex(message => message.id === userMessageId)
    const forkedFromMessageId = sourceIndex > 0 ? messages.value[sourceIndex - 1]?.id ?? null : null
    const attachmentIds = sourceMessage.attachments.map(attachment => attachment.attachmentId)
    const contextItems = readMessageContextItems(sourceMessage.content)
    const trimmedContent = content.trim()
    if (!trimmedContent && !attachmentIds.length)
      return false

    const sourceNavigationGeneration = navigationGeneration
    const ownsSourceView = () => sourceNavigationGeneration === navigationGeneration
      && activeConversationId.value === conversationId
      && activeBranchId.value === parentBranchId
    const request = {
      attachmentIds,
      content: trimmedContent,
      contextItems,
      conversationId,
      modelSelection: {
        modelId: selectedModel.modelId,
        providerId: selectedModel.providerId,
        reasoning: desktopRuntime.selectedEffort.value,
        serviceTier: desktopRuntime.selectedServiceTier.value,
      },
      userMessageId,
    }
    const requestKey = `edit:${await createRequestFingerprint(request)}`
    const requestId = getMutationRequestId(requestKey)
    isMutatingBranch.value = true
    errorMessage.value = null
    try {
      const turn = await api.localChat.chat.editUserMessage({
        ...request,
        requestId,
      })
      mutationRequestIds.delete(requestKey)
      if (!ownsSourceView()) {
        void refreshCollections().catch(() => {})
        return true
      }
      const branch: LocalConversationBranch = {
        conversationId,
        createdAt: turn.run.startedAt,
        forkedFromMessageId,
        id: turn.branchId,
        parentBranchId: forkedFromMessageId ? parentBranchId : null,
      }
      activeBranchId.value = turn.branchId
      upsertBranch(branch)
      updateActiveConversationBranch(turn.branchId, turn.run.startedAt)
      runSync.applyEditedTurn(turn, userMessageId)
      void Promise.all([
        refreshBranches(),
        refreshCollections(),
      ]).catch((error) => {
        if (activeConversationId.value === conversationId)
          errorMessage.value = normalizeDesktopError(error, language.value)
      })
      return true
    }
    catch (error) {
      if (ownsSourceView())
        errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function regenerateAssistant(assistantMessageId: string) {
    const conversationId = activeConversationId.value
    const parentBranchId = activeBranchId.value
    if (!conversationId || !parentBranchId || !canMutateBranch.value)
      return false

    const sourceNavigationGeneration = navigationGeneration
    const ownsSourceView = () => sourceNavigationGeneration === navigationGeneration
      && activeConversationId.value === conversationId
      && activeBranchId.value === parentBranchId
    const requestKey = `regenerate:${conversationId}:${parentBranchId}:${assistantMessageId}`
    const requestId = getMutationRequestId(requestKey)
    isMutatingBranch.value = true
    errorMessage.value = null
    try {
      const turn = await api.localChat.chat.regenerateAssistant({
        assistantMessageId,
        conversationId,
        requestId,
      })
      mutationRequestIds.delete(requestKey)
      if (!ownsSourceView()) {
        void refreshCollections().catch(() => {})
        return true
      }
      const branch: LocalConversationBranch = {
        conversationId,
        createdAt: turn.run.startedAt,
        forkedFromMessageId: turn.run.triggeringMessageId,
        id: turn.branchId,
        parentBranchId,
      }
      activeBranchId.value = turn.branchId
      upsertBranch(branch)
      updateActiveConversationBranch(turn.branchId, turn.run.startedAt)
      runSync.applyRegeneratedTurn(turn, assistantMessageId)
      void Promise.all([
        refreshBranches(),
        refreshCollections(),
      ]).catch((error) => {
        if (activeConversationId.value === conversationId)
          errorMessage.value = normalizeDesktopError(error, language.value)
      })
      return true
    }
    catch (error) {
      if (ownsSourceView())
        errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isMutatingBranch.value = false
    }
  }

  async function selectAttachments() {
    const remainingCount = 16 - attachments.value.length
    if (remainingCount <= 0) {
      errorMessage.value = t('desktop.chat.attachmentLimit')
      return
    }
    isSelectingFiles.value = true
    try {
      const rejected = await desktopDraft.appendAttachments(
        await api.localChat.attachments.selectFiles({ remainingCount }),
      )
      if (rejected)
        errorMessage.value = t('desktop.chat.attachmentLimit')
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
    }
    finally {
      isSelectingFiles.value = false
    }
  }

  async function listContextOptions(fileQuery: string | null): Promise<DesktopComposerContextOptions> {
    await desktopRuntime.loadSkills(projectId.value)
    const files = projectId.value
      ? await api.localChat.projects.searchFiles(projectId.value, fileQuery ?? '')
      : []
    return {
      files: files.map(file => ({
        description: file.relativePath,
        kind: 'file' as const,
        label: file.name,
        path: file.relativePath,
        value: file.relativePath,
      })),
      skills: desktopRuntime.skills.value.skills
        .filter(skill => skill.enabled)
        .map(skill => ({
          description: skill.description,
          kind: 'skill' as const,
          label: skill.name,
          path: null,
          value: skill.name,
        })),
    }
  }

  async function send(payload: DesktopComposerSubmitPayload | string) {
    const content = typeof payload === 'string' ? payload : payload.content
    const contextItems: ReadonlyArray<LocalPromptContextItem> = typeof payload === 'string'
      ? []
      : payload.contextItems
    if ((!content.trim() && !attachments.value.length) || !canSend.value)
      return false
    const command = parseBuddyChatCommand(content)
    if (command?.kind === 'action')
      return executeActionCommand(command, contextItems)

    const sourceKey = draftTargetKey.value
    const sourceNavigationGeneration = navigationGeneration
    const ownsSourceView = () => sourceNavigationGeneration === navigationGeneration
      && draftTargetKey.value === sourceKey
    const selectedModel = desktopRuntime.selectedModel.value
    const modelSelection = selectedModel
      ? {
          modelId: selectedModel.modelId,
          providerId: selectedModel.providerId,
          reasoning: desktopRuntime.selectedEffort.value,
          serviceTier: desktopRuntime.selectedServiceTier.value,
        }
      : null
    const turnRequest = {
      attachmentIds: attachments.value.map(item => item.attachmentId),
      branchId: activeBranchId.value,
      content: content.trim(),
      contextItems: [...contextItems],
      conversationId: activeConversationId.value,
      modelSelection,
      projectId: projectId.value,
    }
    const prepared = desktopDraft.prepareSend(await createRequestFingerprint(turnRequest))
    isSending.value = true
    errorMessage.value = null
    try {
      if (!await persistWorkspaceState())
        return false
      const result = await api.localChat.chat.startTurn({
        ...turnRequest,
        requestId: prepared.requestId,
      })
      const ownsCurrentView = ownsSourceView()
      if (ownsCurrentView) {
        activeConversationId.value = result.conversationId
        activeBranchId.value = result.branchId
        if (!branches.value.some(branch => branch.id === result.branchId)) {
          upsertBranch({
            conversationId: result.conversationId,
            createdAt: result.run.startedAt,
            forkedFromMessageId: null,
            id: result.branchId,
            parentBranchId: null,
          })
        }
        runSync.applyRunStart(result)
      }
      if (result.run.status === 'failed' || result.run.status === 'cancelled') {
        desktopDraft.retarget(sourceKey, `conversation:${result.conversationId}`)
        if (ownsCurrentView) {
          desktopDraft.restoreCurrentDraft()
          errorMessage.value = runTerminationMessage(result.run.errorCode)
        }
        void refreshCollections().catch(() => {})
        void persistWorkspaceState()
        return false
      }
      desktopDraft.clear(sourceKey)
      if (ownsCurrentView)
        desktopDraft.restoreCurrentDraft()
      void refreshCollections().catch(() => {})
      void persistWorkspaceState()
      return true
    }
    catch (error) {
      if (ownsSourceView())
        errorMessage.value = normalizeDesktopError(error, language.value)
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
    const conversationId = activeConversationId.value
    const branchId = activeBranchId.value
    const commandItems = contextItems.filter(item => item.kind === 'slashCommand')
    if (
      !conversationId
      || !branchId
      || attachments.value.length > 0
      || contextItems.some(item => item.kind !== 'slashCommand')
      || commandItems.length > 1
      || (commandItems[0] && commandItems[0].value !== `/${command.name}`)
    ) {
      errorMessage.value = t('desktop.chat.commandUnavailable')
      return false
    }

    const sourceKey = draftTargetKey.value
    const sourceNavigationGeneration = navigationGeneration
    const ownsSourceView = () => sourceNavigationGeneration === navigationGeneration
      && activeConversationId.value === conversationId
      && activeBranchId.value === branchId
    const requestKey = `command:${conversationId}:${branchId}:${command.name}:${command.arguments}`
    const requestId = getMutationRequestId(requestKey)
    isSending.value = true
    errorMessage.value = null
    try {
      if (!await persistWorkspaceState())
        return false
      const result = await api.localChat.chat.executeCommand({
        arguments: command.arguments,
        branchId,
        command: command.name,
        conversationId,
        requestId,
      })
      mutationRequestIds.delete(requestKey)
      if (ownsSourceView())
        runSync.applyRunStart(result)
      if (result.run.status === 'failed' || result.run.status === 'cancelled') {
        if (ownsSourceView())
          errorMessage.value = runTerminationMessage(result.run.errorCode)
        return false
      }
      desktopDraft.clear(sourceKey)
      if (ownsSourceView())
        desktopDraft.restoreCurrentDraft()
      void refreshCollections().catch(() => {})
      void persistWorkspaceState()
      return true
    }
    catch (error) {
      if (ownsSourceView())
        errorMessage.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isSending.value = false
    }
  }

  async function cancelActiveRun() {
    if (!activeRun.value)
      return
    try {
      runSync.upsertRuns([await api.localChat.chat.cancel(activeRun.value.id)])
    }
    catch (error) {
      errorMessage.value = normalizeDesktopError(error, language.value)
    }
  }

  function switchDraftTarget(nextProjectId: string | null, preserveCurrent = true) {
    navigationGeneration += 1
    if (preserveCurrent)
      desktopDraft.saveCurrentDraft()
    activeConversationId.value = null
    activeBranchId.value = null
    branches.value = []
    projectId.value = nextProjectId
    runSync.clearConversationState()
    desktopDraft.restoreCurrentDraft()
    errorMessage.value = null
  }

  async function refreshAcceptedBranchState(conversationId: string) {
    const results = await Promise.allSettled([
      refreshBranches(),
      runSync.refreshActiveConversation(),
      refreshCollections(),
    ])
    const rejected = results.find(result => result.status === 'rejected')
    if (
      rejected?.status === 'rejected'
      && activeConversationId.value === conversationId
    ) {
      errorMessage.value = normalizeDesktopError(rejected.reason, language.value)
    }
  }

  function applyActiveConversation(conversation: LocalConversation) {
    const existing = conversations.value.find(item => item.id === conversation.id)
    if (!existing) {
      void refreshConversations().catch(() => {})
      return
    }
    conversations.value = conversations.value.map(item => item.id === conversation.id
      ? { ...item, ...conversation }
      : item)
  }

  function updateActiveConversationBranch(branchId: string, updatedAt: string) {
    const conversationId = activeConversationId.value
    if (!conversationId)
      return
    conversations.value = conversations.value.map(conversation => conversation.id === conversationId
      ? { ...conversation, activeBranchId: branchId, updatedAt }
      : conversation)
  }

  function upsertBranch(branch: LocalConversationBranch) {
    const byId = new Map(branches.value.map(item => [item.id, item]))
    byId.set(branch.id, branch)
    branches.value = [...byId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
  }

  function getMutationRequestId(key: string) {
    const existing = mutationRequestIds.get(key)
    if (existing)
      return existing
    const requestId = crypto.randomUUID()
    mutationRequestIds.set(key, requestId)
    return requestId
  }

  function persistWorkspaceState(): Promise<boolean> {
    const value: LocalWorkspaceStateValue = {
      activeConversationId: activeConversationId.value,
      drafts: desktopDraft.exportDrafts(),
      projectId: projectId.value,
    }
    const operation = persistTail.then(async () => {
      await api.localChat.workspaceState.write(value)
    })
    persistTail = operation.catch((error) => {
      errorMessage.value = normalizeDesktopError(error, language.value)
    })
    return operation.then(() => true, () => false)
  }

  onBeforeUnmount(() => {
    contextUsageRequestId += 1
    if (conversationActivityRefreshTimer !== null)
      window.clearTimeout(conversationActivityRefreshTimer)
    desktopRuntime.dispose()
    stopRunEvents()
    runSync.dispose()
  })

  return {
    ...desktopRuntime,
    notificationError: desktopNotifications.error,
    notificationItems: desktopNotifications.items,
    notificationLoading: desktopNotifications.isLoading,
    notificationUnseenCount: desktopNotifications.unseenCount,
    loadNotifications: desktopNotifications.load,
    markAllNotificationsSeen: desktopNotifications.markAllSeen,
    markNotificationSeen: desktopNotifications.markSeen,
    activateBranch,
    activeBranchId: readonly(activeBranchId),
    activeConversation: readonly(activeConversation),
    activeConversationId: readonly(activeConversationId),
    activeProject: readonly(activeProject),
    activeRun: readonly(activeRun),
    approvalViews: readonly(approvalViews),
    approvals: readonly(approvals),
    attachments: readonly(attachments),
    branches: readonly(branches),
    canMutateBranch: readonly(canMutateBranch),
    canSend: readonly(canSend),
    cancelActiveRun,
    composerContent: readonly(composerContent),
    contextUsage: readonly(contextUsage),
    conversations: readonly(conversations),
    createProject,
    currentCwd: readonly(currentCwd),
    currentScope: readonly(currentScope),
    currentTitle: readonly(currentTitle),
    deleteConversation,
    deleteProject,
    dismissChatBlocker() {
      if (visibleChatBlocker.value?.dismissible)
        dismissedChatBlockerKind.value = visibleChatBlocker.value.kind
    },
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    hasOlderMessages: readonly(hasOlderMessages),
    initialize,
    isLoading: readonly(isLoading),
    isLoadingOlderMessages: readonly(isLoadingOlderMessages),
    isMutatingBranch: readonly(isMutatingBranch),
    isSelectingFiles: readonly(isSelectingFiles),
    isSending: readonly(isSending),
    listContextOptions,
    listActiveConversationMessages,
    loadOlderMessages: runSync.loadOlderMessages,
    listRecentRuns: () => api.localChat.runs.list({ limit: 60 }),
    listRunEvents: (runId: string) => api.localChat.runs.listEvents({ limit: 300, runId }),
    messages: readonly(messages),
    openConversation,
    projectId: readonly(projectId),
    projects: readonly(projects),
    removeAttachment: desktopDraft.removeAttachment,
    regenerateAssistant,
    renameConversation,
    resolveApproval,
    resolvingApprovalIds: readonly(resolvingApprovalIds),
    runEvents: readonly(runEvents),
    runs: readonly(runs),
    timelineItems: readonly(timelineItems),
    selectAttachments,
    send,
    startGlobalConversation,
    startProjectConversation,
    editUserMessage,
    updateComposerContent: desktopDraft.updateComposerContent,
    updateProject,
    visibleChatBlocker: readonly(visibleChatBlocker),
  }
}

export type DesktopChatController = ReturnType<typeof useDesktopChat>

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

function requireDesktopApi() {
  if (!window.lexoraDesktop)
    throw new Error('Lexora Desktop bridge is unavailable')
  return window.lexoraDesktop
}

async function createRequestFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
