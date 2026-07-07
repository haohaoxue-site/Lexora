import type { JSONContent } from '@tiptap/core'
import type {
  BuddyChatConversationListItem,
  BuddyChatDraftState,
  BuddyChatProjectListItem,
  BuddyChatWorkspaceTarget,
} from '@/chat/buddyChatWorkspace'
import type { BuddyChatDraftAttachment } from '@/chat/chatAttachmentView'
import type {
  BuddyApproval,
  BuddyChatModelSelection,
  BuddyChatPromptContextItem,
  BuddyChatRunEvent,
  BuddyCodexRuntimeStatus,
  BuddyCodexUserInput,
  BuddyConversation,
  BuddyMessage,
  BuddyProject,
  BuddyRun,
  BuddyRuntime,
} from '@/lib/tauriRuntime'
import { computed, onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'
import {
  createConversationListItems,
  createDraftTargetFromDraft,
  createEmptyBuddyChatDraft,
  createGlobalDraftTarget,
  createProjectDraftTarget,
  createProjectListItems,
  createStartBuddyAgentTurnRequest,
  decodeBuddyWorkspaceState,
  encodeBuddyWorkspaceState,
  resolveChatTargetCwd,
  resolveWorkspaceHeaderTitle,
} from '@/chat/buddyChatWorkspace'
import { createBuddyConversationRefreshGate } from '@/chat/buddyConversationRefreshGate'
import { createBuddyRunEventSignalGate } from '@/chat/buddyRunEventSignal'
import { mergeBuddyRunSnapshots, resolveRunPollingTerminal } from '@/chat/buddyRunTerminal'
import { resolveBuddyLocale, translateBuddy } from '@/i18n/buddyI18n'
import { createAsyncEventQueue } from '@/lib/asyncEventQueue'
import { isTauriRuntime, normalizeBuddyCommandError } from '@/lib/invokeClient'
import {
  approveBuddyCodexAppServerRequestApproval,
  approveBuddyReadOnlyTask,
  authorizeBuddyProjectFromFolderPicker,
  cancelBuddyChatRun,
  createBrowserCodexRuntimeStatus,
  deleteBuddyConversation,
  denyBuddyApproval,
  getBuddyRun,
  listBuddyApprovals,
  listBuddyChatConversationEvents,
  listBuddyChatRunEvents,
  listBuddyConversationMessages,
  listBuddyConversations,
  listBuddyProjects,
  listBuddyRuns,
  listenBuddyRunStateChanged,
  loadBuddyCodexRuntimeStatus,
  readBuddySettingJson,
  startBuddyAgentTurn,
  writeBuddySettingJson,
} from '@/lib/tauriRuntime'

export interface BuddyChatSubmitPayload {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  runtime?: BuddyRuntime
  content: string
  contextItems?: ReadonlyArray<BuddyChatPromptContextItem>
  inputs?: ReadonlyArray<BuddyCodexUserInput>
  modelSelection?: BuddyChatModelSelection | null
}

const RUN_EVENT_POLL_INTERVAL_MS = 360
const RUN_EVENT_SIGNAL_FALLBACK_MS = 3000
const RUN_EVENT_POLL_TIMEOUT_MS = 30 * 60 * 1000
const WORKSPACE_STATE_KEY = 'buddy.chat.workspace'
const CODEX_APP_SERVER_REQUEST_APPROVAL_KIND = 'run.codex_app_server_request'

export function useBuddyWorkspaceChat(options: {
  language?: () => string
} = {}) {
  const runtimeStatus = shallowRef<BuddyCodexRuntimeStatus>(createBrowserCodexRuntimeStatus())
  const projects = shallowRef<ReadonlyArray<BuddyProject>>([])
  const conversations = shallowRef<ReadonlyArray<BuddyConversation>>([])
  const runs = shallowRef<ReadonlyArray<BuddyRun>>([])
  const currentTarget = shallowRef<BuddyChatWorkspaceTarget>(createGlobalDraftTarget())
  const draft = shallowRef<BuddyChatDraftState>(createEmptyBuddyChatDraft())
  const messages = shallowRef<ReadonlyArray<BuddyMessage>>([])
  const runEvents = shallowRef<ReadonlyArray<BuddyChatRunEvent>>([])
  const approvals = shallowRef<ReadonlyArray<BuddyApproval>>([])
  const errorMessage = shallowRef<string | null>(null)
  const isDrawerOpen = shallowRef(false)
  const isAuthorizingProject = shallowRef(false)
  const isLoading = shallowRef(false)
  const isResolvingApproval = shallowRef(false)
  const isSending = shallowRef(false)
  const composerVersion = shallowRef(0)
  const activeRunId = shallowRef<string | null>(null)

  let persistTimer: number | null = null
  let hasHydratedWorkspace = false
  let isRunStateSubscriptionDisposed = false
  let runStateSubscriptionPromise: Promise<void> | null = null
  let unlistenRunStateChanged: (() => void) | null = null
  const conversationRefreshGate = createBuddyConversationRefreshGate()
  const runEventSignalGate = createBuddyRunEventSignalGate()
  const reconcileQueue = createAsyncEventQueue({
    onError(error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    },
    schedule: 'postPaint',
  })

  const currentCwd = computed(() =>
    resolveChatTargetCwd({
      conversations: conversations.value,
      draft: draft.value,
      target: currentTarget.value,
    }),
  )
  const hasMessages = computed(() => messages.value.length > 0)
  const globalConversationItems = computed<ReadonlyArray<BuddyChatConversationListItem>>(() =>
    createConversationListItems(
      conversations.value.filter(conversation => !conversation.projectRoot),
      runs.value,
    ),
  )
  const projectItems = computed<ReadonlyArray<BuddyChatProjectListItem>>(() =>
    createProjectListItems(projects.value, conversations.value, runs.value),
  )
  const headerTitle = computed(() =>
    resolveWorkspaceHeaderTitle({
      conversations: conversations.value,
      draft: draft.value,
      newConversationLabel: t('chat.newConversation'),
      projects: projects.value,
      target: currentTarget.value,
    }),
  )
  const composerDraft = computed(() =>
    currentTarget.value.kind === 'draft' ? draft.value : null,
  )
  const pendingApprovals = computed(() =>
    approvals.value.filter(approval =>
      isPendingApprovalVisibleForCurrentTarget({
        activeRunId: activeRunId.value,
        approval,
        runs: runs.value,
        target: currentTarget.value,
      }),
    ),
  )

  function t(key: Parameters<typeof translateBuddy>[1]) {
    return translateBuddy(resolveBuddyLocale(options.language?.() ?? 'zh-CN'), key)
  }

  async function refresh() {
    isLoading.value = true
    errorMessage.value = null

    try {
      if (!isTauriRuntime()) {
        runtimeStatus.value = createBrowserCodexRuntimeStatus()
        projects.value = []
        conversations.value = []
        runs.value = []
        currentTarget.value = createGlobalDraftTarget()
        draft.value = createEmptyBuddyChatDraft()
        messages.value = []
        runEvents.value = []
        approvals.value = []
        composerVersion.value += 1
        return
      }

      const [
        nextProjects,
        nextConversations,
        nextRuns,
        nextApprovals,
        codexStatus,
        workspaceSetting,
      ] = await Promise.all([
        listBuddyProjects(),
        listBuddyConversations(),
        listBuddyRuns({ limit: 100 }),
        listBuddyApprovals({ status: 'pending' }),
        loadBuddyCodexRuntimeStatus(),
        readBuddySettingJson(WORKSPACE_STATE_KEY),
      ])
      const restored = workspaceSetting
        ? decodeBuddyWorkspaceState(workspaceSetting.value)
        : {
            draft: createEmptyBuddyChatDraft(),
            lastTarget: null,
          }

      runtimeStatus.value = codexStatus
      projects.value = nextProjects
      conversations.value = nextConversations
      runs.value = nextRuns
      approvals.value = nextApprovals
      draft.value = restored.draft
      currentTarget.value = resolveRestoredTarget(
        restored.lastTarget,
        nextConversations,
        restored.draft,
      )
      composerVersion.value += 1
      hasHydratedWorkspace = true
      await refreshConversationForCurrentTarget()
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    }
    finally {
      isLoading.value = false
    }
  }

  function openDrawer() {
    isDrawerOpen.value = true
  }

  function closeDrawer() {
    isDrawerOpen.value = false
  }

  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value
  }

  function openGlobalDraft() {
    draft.value = {
      ...draft.value,
      projectRoot: null,
      scope: 'global',
    }
    currentTarget.value = createGlobalDraftTarget()
    messages.value = []
    runEvents.value = []
    composerVersion.value += 1
    errorMessage.value = null
    closeDrawer()
    scheduleWorkspacePersistence()
  }

  function openProjectDraft(projectRoot: string) {
    draft.value = {
      ...draft.value,
      projectRoot,
      scope: 'project',
    }
    currentTarget.value = createProjectDraftTarget(projectRoot)
    messages.value = []
    runEvents.value = []
    composerVersion.value += 1
    errorMessage.value = null
    closeDrawer()
    scheduleWorkspacePersistence()
  }

  async function openConversation(conversationId: string) {
    if (currentTarget.value.kind === 'conversation' && currentTarget.value.conversationId === conversationId) {
      closeDrawer()
      return
    }

    currentTarget.value = {
      conversationId,
      kind: 'conversation',
    }
    messages.value = []
    runEvents.value = []
    composerVersion.value += 1
    errorMessage.value = null
    closeDrawer()
    scheduleWorkspacePersistence()
    await refreshConversationForCurrentTarget()
  }

  async function deleteConversation(conversationId: string) {
    if (!isTauriRuntime())
      return

    const deletedConversation = conversations.value.find(conversation => conversation.id === conversationId)
    const isCurrentConversation = currentTarget.value.kind === 'conversation'
      && currentTarget.value.conversationId === conversationId
    errorMessage.value = null

    try {
      await deleteBuddyConversation(conversationId)
      await refreshCollections()

      if (isCurrentConversation) {
        const projectRoot = deletedConversation?.projectRoot ?? null
        draft.value = {
          ...draft.value,
          projectRoot,
          scope: projectRoot ? 'project' : 'global',
        }
        currentTarget.value = projectRoot
          ? createProjectDraftTarget(projectRoot)
          : createGlobalDraftTarget()
        messages.value = []
        runEvents.value = []
        await refreshPendingApprovals()
        composerVersion.value += 1
      }

      scheduleWorkspacePersistence()
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
      await refreshCollections()
      await refreshConversationForCurrentTarget()
    }
  }

  async function authorizeProjectFromFolderPicker() {
    if (isAuthorizingProject.value)
      return null

    if (!isTauriRuntime()) {
      errorMessage.value = t('chat.desktopOnlyProjectAuthorization')
      return null
    }

    isAuthorizingProject.value = true
    errorMessage.value = null

    try {
      const project = await authorizeBuddyProjectFromFolderPicker()
      if (!project)
        return null

      await refreshCollections()
      openProjectDraft(project.root)

      return project
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
      return null
    }
    finally {
      isAuthorizingProject.value = false
    }
  }

  function updateDraft(nextDraft: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    contentJSON: JSONContent
    modelSelection: BuddyChatModelSelection | null
  }) {
    draft.value = {
      ...draft.value,
      attachments: nextDraft.attachments,
      contentJSON: nextDraft.contentJSON,
      modelSelection: nextDraft.modelSelection,
    }
    scheduleWorkspacePersistence()
  }

  async function sendMessage(payload: string | BuddyChatSubmitPayload) {
    const messageContent = typeof payload === 'string' ? payload.trim() : payload.content.trim()
    const attachments = typeof payload === 'string' ? [] : payload.attachments
    const contextItems = typeof payload === 'string' ? [] : payload.contextItems ?? []
    const inputs = typeof payload === 'string' ? [] : payload.inputs ?? []
    const modelSelection = typeof payload === 'string' ? null : payload.modelSelection ?? null
    const runtime = typeof payload === 'string' ? 'codex' : payload.runtime ?? 'codex'
    if (!messageContent && attachments.length === 0)
      return

    if (!isTauriRuntime()) {
      errorMessage.value = t('chat.desktopOnlyCodex')
      return
    }

    isSending.value = true
    errorMessage.value = null
    let sendingRunId: string | null = null

    try {
      await ensureRunStateSubscription()
      const request = createStartBuddyAgentTurnRequest({
        attachments,
        runtime,
        content: messageContent,
        contextItems,
        currentCwd: currentCwd.value,
        currentTarget: currentTarget.value,
        draft: draft.value,
        inputs,
        modelSelection,
        newConversationLabel: t('chat.newConversation'),
      })
      const turn = await startBuddyAgentTurn(request)
      const turnConversationId = turn.conversation.id
      const turnRun = turn.run

      if (turnRun) {
        sendingRunId = turnRun.id
        activeRunId.value = turnRun.id
      }

      if (request.conversationSeed) {
        currentTarget.value = {
          conversationId: turnConversationId,
          kind: 'conversation',
        }
        draft.value = createEmptyBuddyChatDraft()
        composerVersion.value += 1
      }

      if (currentTarget.value.kind === 'conversation' && currentTarget.value.conversationId === turnConversationId) {
        const nextMessages = turn.assistantMessage
          ? [
              turn.userMessage,
              turn.assistantMessage,
            ]
          : [turn.userMessage]
        messages.value = [
          ...messages.value,
          ...nextMessages,
        ]
        if (turnRun)
          runEvents.value = runEvents.value.filter(event => event.runId !== turnRun.id)
      }
      if (turnRun) {
        runs.value = [
          turnRun,
          ...runs.value.filter(run => run.id !== turnRun.id),
        ]
      }
      scheduleWorkspacePersistence()

      if (turnRun)
        await pollRunUntilTerminal(turnRun.id, turnConversationId)

      releaseSendingRun(sendingRunId)
      queueTurnReconcile(turnConversationId)
    }
    catch (error) {
      const message = normalizeBuddyCommandError(error).message
      releaseSendingRun(sendingRunId)
      errorMessage.value = message
      queueCurrentTargetReconcile()
    }
    finally {
      releaseSendingRun(sendingRunId)
    }
  }

  async function stopMessage() {
    const runId = activeRunId.value
    if (!runId || !isTauriRuntime())
      return

    activeRunId.value = null
    isSending.value = false
    errorMessage.value = null

    try {
      const cancelledRun = await cancelBuddyChatRun(runId)
      runs.value = mergeBuddyRunSnapshots(runs.value, [cancelledRun])
      await refreshPendingApprovals()
      if (cancelledRun.conversationId)
        queueTurnReconcile(cancelledRun.conversationId)
      else
        queueCurrentTargetReconcile()
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
      queueCurrentTargetReconcile()
    }
  }

  function setErrorMessage(message: string | null) {
    errorMessage.value = message
  }

  async function approveApproval(approvalId: string, approvalKind: string) {
    if (!approvalId || isResolvingApproval.value)
      return false

    isResolvingApproval.value = true
    errorMessage.value = null

    try {
      const result = approvalKind === CODEX_APP_SERVER_REQUEST_APPROVAL_KIND
        ? await approveBuddyCodexAppServerRequestApproval(approvalId)
        : await approveBuddyReadOnlyTask(approvalId)
      applyApprovalResolution(result)
      await refreshPendingApprovals()
      return true
    }
    catch (error) {
      const message = normalizeBuddyCommandError(error).message
      await refreshPendingApprovals()
      errorMessage.value = message
      return false
    }
    finally {
      isResolvingApproval.value = false
    }
  }

  async function denyApproval(approvalId: string) {
    if (!approvalId || isResolvingApproval.value)
      return false

    isResolvingApproval.value = true
    errorMessage.value = null

    try {
      const result = await denyBuddyApproval(approvalId)
      applyApprovalResolution(result)
      await refreshPendingApprovals()
      return true
    }
    catch (error) {
      const message = normalizeBuddyCommandError(error).message
      await refreshPendingApprovals()
      errorMessage.value = message
      return false
    }
    finally {
      isResolvingApproval.value = false
    }
  }

  async function refreshConversationForCurrentTarget() {
    if (currentTarget.value.kind !== 'conversation') {
      messages.value = []
      runEvents.value = []
      return
    }

    await refreshConversationForConversation(currentTarget.value.conversationId)
  }

  async function refreshConversationForConversation(conversationId: string) {
    const requestId = conversationRefreshGate.start(conversationId)
    const [nextMessages, nextRunEvents] = await Promise.all([
      listBuddyConversationMessages({ conversationId }),
      listRunEventsForConversation(conversationId),
    ])
    if (!conversationRefreshGate.isCurrent(conversationId, requestId))
      return
    if (currentTarget.value.kind !== 'conversation' || currentTarget.value.conversationId !== conversationId)
      return

    messages.value = nextMessages
    runEvents.value = nextRunEvents
  }

  async function refreshCollections() {
    const [nextProjects, nextConversations, nextRuns, nextApprovals] = await Promise.all([
      listBuddyProjects(),
      listBuddyConversations(),
      listBuddyRuns({ limit: 100 }),
      listBuddyApprovals({ status: 'pending' }),
    ])
    projects.value = nextProjects
    conversations.value = nextConversations
    runs.value = nextRuns
    approvals.value = nextApprovals
    currentTarget.value = resolveAvailableTarget(currentTarget.value, nextConversations, draft.value)
  }

  async function refreshPendingApprovals() {
    if (!isTauriRuntime()) {
      approvals.value = []
      return
    }

    approvals.value = await listBuddyApprovals({ status: 'pending' })
  }

  function releaseSendingRun(sendingRunId: string | null) {
    if (activeRunId.value === sendingRunId)
      activeRunId.value = null

    isSending.value = false
  }

  function queueTurnReconcile(conversationId: string) {
    reconcileQueue.enqueue(`chat-conversation:${conversationId}`, () => reconcileTurn(conversationId))
  }

  function queueCurrentTargetReconcile() {
    if (currentTarget.value.kind !== 'conversation') {
      queueCollectionsReconcile()
      return
    }

    queueTurnReconcile(currentTarget.value.conversationId)
  }

  function queueCollectionsReconcile() {
    reconcileQueue.enqueue('chat-collections', refreshCollections)
  }

  async function reconcileTurn(conversationId: string) {
    await refreshCollections()
    await refreshConversationForConversation(conversationId)
  }

  async function listRunEventsForConversation(conversationId: string) {
    return listBuddyChatConversationEvents({
      conversationId,
      eventLimit: 3000,
      runLimit: 40,
    })
  }

  async function pollRunUntilTerminal(runId: string, conversationId: string) {
    let afterId: number | null = null
    const events: BuddyChatRunEvent[] = []
    const startedAt = Date.now()

    for (;;) {
      const [nextEvents, nextRun, nextApprovals]: [
        ReadonlyArray<BuddyChatRunEvent>,
        BuddyRun,
        ReadonlyArray<BuddyApproval>,
      ] = await Promise.all([
        listBuddyChatRunEvents({
          afterId,
          limit: 100,
          runId,
        }),
        getBuddyRun(runId),
        listBuddyApprovals({ status: 'pending' }),
      ])
      runs.value = mergeBuddyRunSnapshots(runs.value, [nextRun])
      approvals.value = nextApprovals

      if (nextEvents.length > 0) {
        events.push(...nextEvents)
        afterId = nextEvents[nextEvents.length - 1]?.id ?? afterId
        if (currentTarget.value.kind === 'conversation' && currentTarget.value.conversationId === conversationId) {
          const preservedEvents = runEvents.value.filter(event => event.runId !== runId)
          runEvents.value = [
            ...preservedEvents,
            ...events,
          ]
        }
      }

      const terminal = resolveRunPollingTerminal({
        events,
        run: nextRun,
      })
      if (terminal) {
        if (terminal.kind === 'failed')
          throw new Error(resolveRunFailureMessage(terminal.event, t))

        return
      }

      if (Date.now() - startedAt > RUN_EVENT_POLL_TIMEOUT_MS)
        throw new Error(t('chat.codexRunFailed'))

      await waitForRunEventSignal(runId)
    }
  }

  async function ensureRunStateSubscription() {
    if (!isTauriRuntime() || unlistenRunStateChanged)
      return

    if (!runStateSubscriptionPromise) {
      runStateSubscriptionPromise = listenBuddyRunStateChanged((event) => {
        runEventSignalGate.signalRun(event.runId)
      })
        .then((unlisten) => {
          if (isRunStateSubscriptionDisposed) {
            unlisten()
            return
          }

          unlistenRunStateChanged = unlisten
        })
        .catch(() => {})
        .finally(() => {
          runStateSubscriptionPromise = null
        })
    }

    await runStateSubscriptionPromise
  }

  function waitForRunEventSignal(runId: string) {
    if (!isTauriRuntime())
      return waitForRunEventPoll()

    return runEventSignalGate.waitForRun(runId, RUN_EVENT_SIGNAL_FALLBACK_MS)
  }

  function applyApprovalResolution(result: unknown) {
    const events = extractApprovalResolutionEvents(result)
    if (events.length > 0) {
      mergeCurrentRunEvents(events)
      for (const event of events)
        runEventSignalGate.signalRun(event.runId)
    }
    const run = extractApprovalResolutionRun(result)
    if (run)
      runs.value = mergeBuddyRunSnapshots(runs.value, [run])
  }

  function mergeCurrentRunEvents(nextEvents: ReadonlyArray<BuddyChatRunEvent>) {
    if (currentTarget.value.kind !== 'conversation') {
      return
    }

    const conversationId = currentTarget.value.conversationId
    const visibleRunIds = new Set(
      runs.value
        .filter(run => run.conversationId === conversationId)
        .map(run => run.id),
    )
    if (activeRunId.value)
      visibleRunIds.add(activeRunId.value)

    const relevantEvents = nextEvents.filter(event => visibleRunIds.has(event.runId))
    if (relevantEvents.length === 0)
      return

    runEvents.value = mergeBuddyChatRunEvents(runEvents.value, relevantEvents)
  }

  function scheduleWorkspacePersistence() {
    if (!hasHydratedWorkspace)
      return

    if (persistTimer !== null)
      window.clearTimeout(persistTimer)

    persistTimer = window.setTimeout(() => {
      persistTimer = null
      void writeBuddySettingJson(
        WORKSPACE_STATE_KEY,
        encodeBuddyWorkspaceState(draft.value, currentTarget.value),
      )
    }, 180)
  }

  onMounted(() => {
    void ensureRunStateSubscription()
    void refresh()
  })

  onBeforeUnmount(() => {
    isRunStateSubscriptionDisposed = true
    unlistenRunStateChanged?.()
    unlistenRunStateChanged = null
    runEventSignalGate.dispose()

    if (persistTimer !== null)
      window.clearTimeout(persistTimer)

    conversationRefreshGate.clear()
    reconcileQueue.dispose()
  })

  return {
    runtimeStatus: readonly(runtimeStatus),
    approvals: pendingApprovals,
    approveApproval,
    authorizeProjectFromFolderPicker,
    closeDrawer,
    composerDraft,
    composerVersion: readonly(composerVersion),
    conversations: readonly(conversations),
    currentTarget: readonly(currentTarget),
    denyApproval,
    deleteConversation,
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    globalConversationItems,
    hasMessages,
    headerTitle,
    isAuthorizingProject: readonly(isAuthorizingProject),
    isDrawerOpen,
    isLoading: readonly(isLoading),
    isResolvingApproval: readonly(isResolvingApproval),
    isSending: readonly(isSending),
    messages: readonly(messages),
    openDrawer,
    openGlobalDraft,
    openProjectDraft,
    openConversation,
    projectItems,
    projects: readonly(projects),
    refresh,
    runEvents: readonly(runEvents),
    runs: readonly(runs),
    sendMessage,
    setErrorMessage,
    stopMessage,
    currentCwd,
    toggleDrawer,
    updateDraft,
  }
}

function resolveRestoredTarget(
  target: BuddyChatWorkspaceTarget | null,
  conversations: ReadonlyArray<BuddyConversation>,
  draft: BuddyChatDraftState,
) {
  if (!target)
    return conversations[0] ? { conversationId: conversations[0].id, kind: 'conversation' as const } : createDraftTargetFromDraft(draft)

  return resolveAvailableTarget(target, conversations, draft)
}

function resolveAvailableTarget(
  target: BuddyChatWorkspaceTarget,
  conversations: ReadonlyArray<BuddyConversation>,
  draft: BuddyChatDraftState,
) {
  if (target.kind === 'conversation') {
    const conversation = conversations.find(item => item.id === target.conversationId)
    if (conversation) {
      return {
        conversationId: conversation.id,
        kind: 'conversation' as const,
      }
    }

    return conversations[0]
      ? {
          conversationId: conversations[0].id,
          kind: 'conversation' as const,
        }
      : createDraftTargetFromDraft(draft)
  }
  return target.scope === 'project' && target.projectRoot
    ? createProjectDraftTarget(target.projectRoot)
    : createGlobalDraftTarget()
}

function waitForRunEventPoll() {
  return new Promise(resolve => setTimeout(resolve, RUN_EVENT_POLL_INTERVAL_MS))
}

function resolveRunFailureMessage(
  event: BuddyChatRunEvent | null,
  translate: (key: Parameters<typeof translateBuddy>[1]) => string,
) {
  if (
    event
    && (
      typeof event.payload === 'object'
      && event.payload !== null
      && 'message' in event.payload
      && typeof event.payload.message === 'string'
      && event.payload.message.length > 0
    )
  ) {
    return event.payload.message
  }

  return translate('chat.codexRunFailed')
}

function isPendingApprovalVisibleForCurrentTarget(options: {
  activeRunId: string | null
  approval: BuddyApproval
  runs: ReadonlyArray<BuddyRun>
  target: BuddyChatWorkspaceTarget
}) {
  if (options.approval.status !== 'pending' || !options.approval.runId)
    return false
  if (options.activeRunId === options.approval.runId)
    return true
  if (options.target.kind !== 'conversation')
    return false

  const conversationId = options.target.conversationId
  return options.runs.some(run =>
    run.id === options.approval.runId
    && run.conversationId === conversationId,
  )
}

function extractApprovalResolutionEvents(result: unknown): ReadonlyArray<BuddyChatRunEvent> {
  if (typeof result !== 'object' || result === null)
    return []

  const record = result as { event?: unknown, events?: unknown }
  if (isBuddyChatRunEvent(record.event))
    return [record.event]
  if (Array.isArray(record.events))
    return record.events.filter(isBuddyChatRunEvent)

  return []
}

function extractApprovalResolutionRun(result: unknown): BuddyRun | null {
  if (typeof result !== 'object' || result === null)
    return null

  const run = (result as { run?: unknown }).run
  return isBuddyRun(run) ? run : null
}

function isBuddyChatRunEvent(value: unknown): value is BuddyChatRunEvent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as BuddyChatRunEvent).id === 'number'
    && typeof (value as BuddyChatRunEvent).runId === 'string'
    && typeof (value as BuddyChatRunEvent).eventType === 'string'
}

function isBuddyRun(value: unknown): value is BuddyRun {
  return typeof value === 'object'
    && value !== null
    && typeof (value as BuddyRun).id === 'string'
    && typeof (value as BuddyRun).status === 'string'
}

function mergeBuddyChatRunEvents(
  currentEvents: ReadonlyArray<BuddyChatRunEvent>,
  nextEvents: ReadonlyArray<BuddyChatRunEvent>,
) {
  const eventByKey = new Map<string, BuddyChatRunEvent>()
  for (const event of [...currentEvents, ...nextEvents])
    eventByKey.set(`${event.runId}:${event.id}`, event)

  return [...eventByKey.values()].sort((first, second) => first.id - second.id)
}
