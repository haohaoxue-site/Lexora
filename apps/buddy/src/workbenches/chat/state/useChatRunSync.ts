import type {
  LocalApproval,
  LocalChangeSetSummary,
  LocalChatApi,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
  LocalTurnStart,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { ChatRunEventBuckets } from './chatRunEventBuckets'
import { computed, shallowRef } from 'vue'
import {
  compactChatRunEventSnapshots,
  hasChatRunEventSequenceGap,
  mergeChatRunEventBuckets,
  mergeChatRunEvents,
  replaceChatRunEventBuckets,
} from './chatRunEventBuckets'

const TIMELINE_PAGE_SIZE = 100
const SNAPSHOT_RECONCILIATION_EVENT_TYPES = new Set([
  'approval.requested',
  'approval.resolved',
  'output.produced',
  'run.cancelled',
  'run.completed',
  'run.failed',
])

interface UseChatRunSyncOptions {
  activeBranchId: Ref<string | null>
  activeConversationId: Ref<string | null>
  api: LocalChatApi
  onError: (error: unknown) => void
}

interface RefreshFlight {
  branchId: string
  conversationId: string
  dirty: boolean
  promise: Promise<void>
  projectionGeneration: number
}

export function useChatRunSync(options: UseChatRunSyncOptions) {
  let hasLoadedTimelinePage = false
  const timelineItems = shallowRef<ReadonlyArray<LocalConversationTimelineItem>>([])
  const messages = computed<ReadonlyArray<LocalMessage>>(() => timelineItems.value.filter(
    (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
      item.kind === 'message',
  ))
  const runs = shallowRef<ReadonlyArray<LocalRun>>([])
  const runSignalEvents = shallowRef<ReadonlyArray<LocalRunEvent>>([])
  const runEventBuckets = shallowRef<ChatRunEventBuckets>(new Map())
  const runOutputs = shallowRef<ReadonlyArray<LocalRunOutput>>([])
  const changeSets = shallowRef<ReadonlyArray<LocalChangeSetSummary>>([])
  const approvals = shallowRef<ReadonlyArray<LocalApproval>>([])
  const isLoadingOlderMessages = shallowRef(false)
  const timelineCursor = shallowRef<string | null>(null)
  const hasOlderMessages = computed(() => timelineCursor.value !== null)
  const knownRunIds = new Set<string>()
  let loadedBranchId: string | null = null
  let loadedConversationId: string | null = null
  let olderLoadGeneration = 0
  let projectionGeneration = 0
  let refreshFlight: RefreshFlight | null = null
  let refreshTimer: number | null = null
  let runEventCommitFrame: number | null = null
  let pendingRunEvents: LocalRunEvent[] = []

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
    if (
      refreshFlight?.conversationId === conversationId
      && refreshFlight.branchId === branchId
      && refreshFlight.projectionGeneration === projectionGeneration
    ) {
      refreshFlight.dirty = true
      return refreshFlight.promise
    }
    const sourceProjectionGeneration = projectionGeneration
    const flight: RefreshFlight = {
      branchId,
      conversationId,
      dirty: false,
      promise: Promise.resolve(),
      projectionGeneration: sourceProjectionGeneration,
    }
    flight.promise = drainRefreshFlight(
      flight,
      conversationId,
      branchId,
      sourceProjectionGeneration,
    ).finally(() => {
      if (refreshFlight === flight)
        refreshFlight = null
    })
    refreshFlight = flight
    return flight.promise
  }

  async function drainRefreshFlight(
    flight: RefreshFlight,
    conversationId: string,
    branchId: string,
    sourceProjectionGeneration: number,
  ): Promise<void> {
    while (true) {
      flight.dirty = false
      await refreshConversationSnapshot(
        conversationId,
        branchId,
        sourceProjectionGeneration,
      )
      if (
        !flight.dirty
        || sourceProjectionGeneration !== projectionGeneration
        || conversationId !== options.activeConversationId.value
        || branchId !== options.activeBranchId.value
      ) {
        return
      }
    }
  }

  async function refreshConversationSnapshot(
    conversationId: string,
    branchId: string,
    sourceProjectionGeneration: number,
  ): Promise<void> {
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
        sourceProjectionGeneration !== projectionGeneration
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
      replaceRunEvents(mergeTimelineEvents(
        flattenRunEventBuckets(runEventBuckets.value),
        timelinePage.runEvents,
        timelinePage.runs,
      ))
      runOutputs.value = mergeRunOutputs(runOutputs.value, timelinePage.outputs)
      changeSets.value = mergeChangeSets(changeSets.value, timelinePage.changeSets)
      const runIds = new Set(runs.value.map(run => run.id))
      approvals.value = pendingApprovals.filter(approval => runIds.has(approval.runId))
    }
    catch (error) {
      if (
        sourceProjectionGeneration === projectionGeneration
        && conversationId === options.activeConversationId.value
        && branchId === options.activeBranchId.value
      ) {
        options.onError(error)
      }
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
      replaceRunEvents(mergeTimelineEvents(
        flattenRunEventBuckets(runEventBuckets.value),
        page.runEvents,
        page.runs,
      ))
      runOutputs.value = mergeRunOutputs(runOutputs.value, page.outputs)
      changeSets.value = mergeChangeSets(changeSets.value, page.changeSets)
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
    pendingRunEvents.push(event)
    if (SNAPSHOT_RECONCILIATION_EVENT_TYPES.has(event.type)) {
      commitPendingRunEventsImmediately()
      scheduleRefresh()
      return
    }
    scheduleRunEventCommit()
  }

  function scheduleRunEventCommit() {
    if (runEventCommitFrame !== null)
      return
    runEventCommitFrame = window.requestAnimationFrame(() => {
      runEventCommitFrame = null
      commitPendingRunEvents()
    })
  }

  function commitPendingRunEventsImmediately() {
    if (runEventCommitFrame !== null) {
      window.cancelAnimationFrame(runEventCommitFrame)
      runEventCommitFrame = null
    }
    commitPendingRunEvents()
  }

  function commitPendingRunEvents() {
    if (pendingRunEvents.length === 0)
      return
    const incoming = pendingRunEvents
    pendingRunEvents = []
    const sequenceGapDetected = hasChatRunEventSequenceGap(runEventBuckets.value, incoming)
    const signalEvents = incoming.filter(isRunSignalEvent)
    if (signalEvents.length > 0) {
      runSignalEvents.value = mergeChatRunEvents(runSignalEvents.value, signalEvents)
    }
    runEventBuckets.value = mergeChatRunEventBuckets(runEventBuckets.value, incoming)
    if (sequenceGapDetected)
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

  function applyRegeneratedTurn(turn: LocalTurnStart) {
    applyReplacementTurn(turn, turn.run.triggeringMessageId, true)
  }

  function applyEditedTurn(turn: LocalTurnStart, userMessageId: string) {
    applyReplacementTurn(turn, userMessageId)
  }

  function applyReplacementTurn(
    turn: LocalTurnStart,
    replacedMessageId: string,
    retainReplacedMessage = false,
  ) {
    if (
      turn.branchId !== options.activeBranchId.value
      || turn.conversationId !== options.activeConversationId.value
    ) {
      return
    }
    const replacedIndex = timelineItems.value.findIndex(item =>
      item.kind === 'message' && item.id === replacedMessageId,
    )
    const retainedTimeline = replacedIndex < 0
      ? []
      : timelineItems.value.slice(0, replacedIndex + (retainReplacedMessage ? 1 : 0))
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
    discardPendingRunEvents()
    projectionGeneration += 1
    olderLoadGeneration += 1
    hasLoadedTimelinePage = false
    timelineCursor.value = null
    isLoadingOlderMessages.value = false
    timelineItems.value = []
    runs.value = []
    runSignalEvents.value = []
    runEventBuckets.value = new Map()
    runOutputs.value = []
    changeSets.value = []
    approvals.value = []
    knownRunIds.clear()
  }

  function discardPendingRunEvents() {
    pendingRunEvents = []
    if (runEventCommitFrame === null)
      return
    window.cancelAnimationFrame(runEventCommitFrame)
    runEventCommitFrame = null
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

  function replaceRunEvents(events: ReadonlyArray<LocalRunEvent>) {
    runSignalEvents.value = events.filter(isRunSignalEvent)
    runEventBuckets.value = replaceChatRunEventBuckets(events)
  }

  return {
    approvals,
    changeSets,
    applyEditedTurn,
    applyRegeneratedTurn,
    applyRunStart,
    clearConversationState,
    dispose() {
      if (refreshTimer !== null)
        window.clearTimeout(refreshTimer)
      discardPendingRunEvents()
    },
    handleRunEvent,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    messages,
    refreshActiveConversation,
    runSignalEvents,
    runEventBuckets,
    runOutputs,
    runs,
    timelineItems,
    upsertRuns,
  }
}

function mergeChangeSets(
  current: ReadonlyArray<LocalChangeSetSummary>,
  incoming: ReadonlyArray<LocalChangeSetSummary>,
): ReadonlyArray<LocalChangeSetSummary> {
  const byId = new Map(current.map(changeSet => [changeSet.changeSetId, changeSet]))
  for (const changeSet of incoming)
    byId.set(changeSet.changeSetId, changeSet)
  return [...byId.values()].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
}

function mergeRunOutputs(
  current: ReadonlyArray<LocalRunOutput>,
  incoming: ReadonlyArray<LocalRunOutput>,
): ReadonlyArray<LocalRunOutput> {
  const byId = new Map(current.map(output => [
    `${output.runId}:${output.sourceToolCallId}`,
    output,
  ]))
  for (const output of incoming)
    byId.set(`${output.runId}:${output.sourceToolCallId}`, output)
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
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

function mergeTimelineEvents(
  current: ReadonlyArray<LocalRunEvent>,
  incoming: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<LocalRunEvent> {
  const terminalRunIds = new Set(runs.flatMap(run => (
    run.status === 'queued' || run.status === 'running' ? [] : [run.id]
  )))
  return compactChatRunEventSnapshots(
    mergeChatRunEvents(
      current.filter(event => !terminalRunIds.has(event.runId)),
      incoming,
    ),
  )
}

function flattenRunEventBuckets(
  buckets: ChatRunEventBuckets,
): ReadonlyArray<LocalRunEvent> {
  return [...buckets.values()].flatMap(bucket => bucket.events)
}

function isRunSignalEvent(event: LocalRunEvent): boolean {
  if (
    event.type === 'context.compaction.completed'
    || event.type === 'context.usage.updated'
  ) {
    return true
  }
  if (event.type !== 'tool.started')
    return false
  const presentation = event.payload.presentation
  return Boolean(
    presentation
    && typeof presentation === 'object'
    && 'card' in presentation
    && presentation.card === 'browser'
    && 'operation' in presentation
    && presentation.operation === 'open',
  )
}
