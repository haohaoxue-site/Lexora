import type {
  LocalApproval,
  LocalChatApi,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalTurnStart,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { computed, shallowRef } from 'vue'

const TIMELINE_PAGE_SIZE = 100

interface UseChatRunSyncOptions {
  activeBranchId: Ref<string | null>
  activeConversationId: Ref<string | null>
  api: LocalChatApi
  onError: (error: unknown) => void
}

export function useChatRunSync(options: UseChatRunSyncOptions) {
  let hasLoadedTimelinePage = false
  const timelineItems = shallowRef<ReadonlyArray<LocalConversationTimelineItem>>([])
  const messages = computed<ReadonlyArray<LocalMessage>>(() => timelineItems.value.filter(
    (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
      item.kind === 'message',
  ))
  const runs = shallowRef<ReadonlyArray<LocalRun>>([])
  const runEvents = shallowRef<ReadonlyArray<LocalRunEvent>>([])
  const approvals = shallowRef<ReadonlyArray<LocalApproval>>([])
  const isLoadingOlderMessages = shallowRef(false)
  const timelineCursor = shallowRef<string | null>(null)
  const hasOlderMessages = computed(() => timelineCursor.value !== null)
  const knownRunIds = new Set<string>()
  let loadedBranchId: string | null = null
  let loadedConversationId: string | null = null
  let olderLoadGeneration = 0
  let projectionGeneration = 0
  let refreshGeneration = 0
  let refreshTimer: number | null = null

  async function refreshActiveConversation() {
    const conversationId = options.activeConversationId.value
    const branchId = options.activeBranchId.value
    if (!conversationId || !branchId) {
      clearConversationState()
      return
    }
    if (loadedConversationId !== conversationId || loadedBranchId !== branchId) {
      resetConversationProjection()
      loadedConversationId = conversationId
      loadedBranchId = branchId
    }
    const generation = ++refreshGeneration
    const isInitialTimelinePage = !hasLoadedTimelinePage
    try {
      const [timelinePage, pendingApprovals] = await Promise.all([
        options.api.conversations.listTimeline({
          branchId,
          conversationId,
          limit: TIMELINE_PAGE_SIZE,
        }),
        options.api.approvals.list({ limit: 100, status: 'pending' }),
      ])
      if (
        generation !== refreshGeneration
        || branchId !== options.activeBranchId.value
        || conversationId !== options.activeConversationId.value
      ) {
        return
      }
      if (isInitialTimelinePage && !hasLoadedTimelinePage) {
        timelineItems.value = timelinePage.items
        timelineCursor.value = timelinePage.nextCursor
        hasLoadedTimelinePage = true
      }
      else {
        timelineItems.value = mergeTailTimelineItems(timelineItems.value, timelinePage.items)
      }
      upsertRuns(timelinePage.runs)
      runEvents.value = mergeTimelineEvents(
        runEvents.value,
        timelinePage.runEvents,
        timelinePage.runs,
      )
      const runIds = new Set(runs.value.map(run => run.id))
      approvals.value = pendingApprovals.filter(approval => runIds.has(approval.runId))
    }
    catch (error) {
      options.onError(error)
    }
  }

  async function loadOlderMessages(): Promise<boolean> {
    const conversationId = loadedConversationId
    const branchId = loadedBranchId
    const cursor = timelineCursor.value
    if (
      !conversationId
      || !branchId
      || !cursor
      || !hasLoadedTimelinePage
      || isLoadingOlderMessages.value
    ) {
      return false
    }
    const sourceProjectionGeneration = projectionGeneration
    const requestGeneration = ++olderLoadGeneration
    isLoadingOlderMessages.value = true
    try {
      const page = await options.api.conversations.listTimeline({
        branchId,
        conversationId,
        cursor,
        limit: TIMELINE_PAGE_SIZE,
      })
      if (
        requestGeneration !== olderLoadGeneration
        || sourceProjectionGeneration !== projectionGeneration
        || conversationId !== options.activeConversationId.value
        || branchId !== options.activeBranchId.value
        || timelineCursor.value !== cursor
      ) {
        return false
      }
      const currentIds = new Set(timelineItems.value.map(timelineItemKey))
      const prepended = page.items.some(item => !currentIds.has(timelineItemKey(item)))
      timelineItems.value = mergeOlderTimelineItems(timelineItems.value, page.items)
      upsertRuns(page.runs)
      runEvents.value = mergeTimelineEvents(runEvents.value, page.runEvents, page.runs)
      timelineCursor.value = page.nextCursor
      return prepended
    }
    catch (error) {
      if (
        sourceProjectionGeneration === projectionGeneration
        && conversationId === options.activeConversationId.value
        && branchId === options.activeBranchId.value
      ) {
        options.onError(error)
      }
      return false
    }
    finally {
      if (requestGeneration === olderLoadGeneration)
        isLoadingOlderMessages.value = false
    }
  }

  function handleRunEvent(event: LocalRunEvent) {
    if (
      loadedConversationId !== options.activeConversationId.value
      || loadedBranchId !== options.activeBranchId.value
      || !knownRunIds.has(event.runId)
    ) {
      return
    }
    runEvents.value = mergeEvents(runEvents.value, [event])
    scheduleRefresh()
  }

  function scheduleRefresh() {
    if (refreshTimer !== null)
      return
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      void refreshActiveConversation()
        .catch(options.onError)
    }, 100)
  }

  function applyRunStart(turn: LocalTurnStart) {
    if (
      turn.branchId !== options.activeBranchId.value
      || turn.conversationId !== options.activeConversationId.value
    ) {
      return
    }
    if (loadedConversationId !== turn.conversationId || loadedBranchId !== turn.branchId) {
      resetConversationProjection()
      loadedConversationId = turn.conversationId
      loadedBranchId = turn.branchId
    }
    knownRunIds.add(turn.runId)
    upsertRuns([turn.run])
    scheduleRefresh()
  }

  function applyRegeneratedTurn(turn: LocalTurnStart, assistantMessageId: string) {
    applyReplacementTurn(turn, assistantMessageId)
  }

  function applyEditedTurn(turn: LocalTurnStart, userMessageId: string) {
    applyReplacementTurn(turn, userMessageId)
  }

  function applyReplacementTurn(turn: LocalTurnStart, replacedMessageId: string) {
    if (
      turn.branchId !== options.activeBranchId.value
      || turn.conversationId !== options.activeConversationId.value
    ) {
      return
    }
    const replacedIndex = timelineItems.value.findIndex(item =>
      item.kind === 'message' && item.id === replacedMessageId,
    )
    const retainedTimeline = replacedIndex < 0 ? [] : timelineItems.value.slice(0, replacedIndex)
    resetConversationProjection()
    loadedConversationId = turn.conversationId
    loadedBranchId = turn.branchId
    timelineItems.value = retainedTimeline
    knownRunIds.add(turn.runId)
    upsertRuns([turn.run])
    scheduleRefresh()
  }

  function clearConversationState() {
    loadedBranchId = null
    loadedConversationId = null
    resetConversationProjection()
  }

  function resetConversationProjection() {
    refreshGeneration += 1
    projectionGeneration += 1
    olderLoadGeneration += 1
    hasLoadedTimelinePage = false
    timelineCursor.value = null
    isLoadingOlderMessages.value = false
    timelineItems.value = []
    runs.value = []
    runEvents.value = []
    approvals.value = []
    knownRunIds.clear()
  }

  function upsertRuns(incoming: ReadonlyArray<LocalRun>) {
    const byId = new Map(runs.value.map(run => [run.id, run]))
    for (const run of incoming) {
      byId.set(run.id, run)
      knownRunIds.add(run.id)
    }
    runs.value = [...byId.values()].sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    )
  }

  return {
    approvals,
    applyEditedTurn,
    applyRegeneratedTurn,
    applyRunStart,
    clearConversationState,
    dispose() {
      if (refreshTimer !== null)
        window.clearTimeout(refreshTimer)
    },
    handleRunEvent,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    refreshActiveConversation,
    runEvents,
    runs,
    timelineItems,
    upsertRuns,
  }
}

function mergeTailTimelineItems(
  current: ReadonlyArray<LocalConversationTimelineItem>,
  incoming: ReadonlyArray<LocalConversationTimelineItem>,
): ReadonlyArray<LocalConversationTimelineItem> {
  const incomingById = new Map(incoming.map(item => [timelineItemKey(item), item]))
  const currentIds = new Set(current.map(timelineItemKey))
  return [
    ...current.map(item => incomingById.get(timelineItemKey(item)) ?? item),
    ...incoming.filter(item => !currentIds.has(timelineItemKey(item))),
  ]
}

function mergeOlderTimelineItems(
  current: ReadonlyArray<LocalConversationTimelineItem>,
  incoming: ReadonlyArray<LocalConversationTimelineItem>,
): ReadonlyArray<LocalConversationTimelineItem> {
  const currentIds = new Set(current.map(timelineItemKey))
  return [
    ...incoming.filter(item => !currentIds.has(timelineItemKey(item))),
    ...current,
  ]
}

function timelineItemKey(item: LocalConversationTimelineItem): string {
  return `${item.kind}:${item.id}`
}

function mergeEvents(
  current: ReadonlyArray<LocalRunEvent>,
  incoming: ReadonlyArray<LocalRunEvent>,
): ReadonlyArray<LocalRunEvent> {
  const byId = new Map(current.map(event => [`${event.runId}:${event.sequence}`, event]))
  for (const event of incoming)
    byId.set(`${event.runId}:${event.sequence}`, event)
  return [...byId.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
      || left.sequence - right.sequence)
}

function mergeTimelineEvents(
  current: ReadonlyArray<LocalRunEvent>,
  incoming: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<LocalRunEvent> {
  const terminalRunIds = new Set(runs.flatMap(run => (
    run.status === 'queued' || run.status === 'running' ? [] : [run.id]
  )))
  return mergeEvents(
    current.filter(event => !terminalRunIds.has(event.runId)),
    incoming,
  )
}
