import type {
  BuddyApproval,
  BuddyAppSettings,
  BuddyClaudeRuntimeStatus,
  BuddyCodexRuntimeStatus,
  BuddyLocalStateStatus,
  BuddyRun,
  BuddyRunEventCount,
  BuddyRunEventSummary,
  BuddyRuntimeDiagnostics,
  BuddyRuntimeStatus,
  BuddyUsageSnapshot,
  UpdateBuddyAppSettingsRequest,
} from '@/lib/tauriRuntime'
import { onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import { createAsyncEventQueue } from '@/lib/asyncEventQueue'
import { isTauriRuntime, normalizeBuddyCommandError } from '@/lib/invokeClient'
import {
  approveBuddyCodexAppServerRequestApproval,
  approveBuddyReadOnlyTask,
  countBuddyRunEvents,
  createBrowserAppSettings,
  createBrowserClaudeRuntimeStatus,
  createBrowserCodexRuntimeStatus,
  createBrowserLocalStateStatus,
  createBrowserRuntimeDiagnostics,
  createBrowserRuntimeStatus,
  createBrowserUsageSnapshot,
  denyBuddyApproval,
  listBuddyApprovals,
  listBuddyRunEventSummaries,
  listBuddyRuns,
  listenBuddyAppSettingsChanged,
  loadBuddyAppSettings,
  loadBuddyLocalStateStatus,
  loadBuddyRuntimeDiagnostics,
  loadBuddyRuntimeStatus,
  loadBuddyUsageSnapshot,
  updateBuddyAppSettings,
  writeBrowserAppSettings,
} from '@/lib/tauriRuntime'
import { createBuddyRuntimeRefreshCacheWindow } from '@/shell/buddyRuntimeRefreshCache'
import { createBuddyRuntimeRefreshPlan } from '@/shell/buddyRuntimeRefreshPlan'

const BUDDY_BACKEND_STATUS_MIN_REFRESH_MS = 60_000
const BUDDY_USAGE_SNAPSHOT_MIN_REFRESH_MS = 3 * 60_000
const CODEX_APP_SERVER_REQUEST_APPROVAL_KIND = 'run.codex_app_server_request'

interface LoadedRuntimeValue<T> {
  loadedAt: number | null
  value: T
}

interface RunEventSummaryCacheKey {
  eventCount: number | null
  runId: string
}

export function useBuddyRuntimeStatus() {
  const status = shallowRef<BuddyRuntimeStatus>(createBrowserRuntimeStatus())
  const appSettings = shallowRef<BuddyAppSettings>(createBrowserAppSettings())
  const codexRuntimeStatus = shallowRef<BuddyCodexRuntimeStatus>(
    createBrowserCodexRuntimeStatus(),
  )
  const claudeRuntimeStatus = shallowRef<BuddyClaudeRuntimeStatus>(
    createBrowserClaudeRuntimeStatus(),
  )
  const runtimeDiagnostics = shallowRef<BuddyRuntimeDiagnostics>(
    createBrowserRuntimeDiagnostics(),
  )
  const localState = shallowRef<BuddyLocalStateStatus>(createBrowserLocalStateStatus())
  const usageSnapshot = shallowRef<BuddyUsageSnapshot>(createBrowserUsageSnapshot())
  const runs = shallowRef<ReadonlyArray<BuddyRun>>([])
  const runEventCounts = shallowRef<ReadonlyArray<BuddyRunEventCount>>([])
  const runEventSummaries = shallowRef<ReadonlyArray<BuddyRunEventSummary>>([])
  const approvals = shallowRef<ReadonlyArray<BuddyApproval>>([])
  const errorMessage = shallowRef<string | null>(null)
  const isResolvingApproval = shallowRef(false)
  const isLoadingRunEventSummaries = shallowRef(false)
  const isUpdatingAppSettings = shallowRef(false)
  const isLoading = shallowRef(false)
  let unlistenAppSettingsChanged: (() => void) | null = null
  let selectedRunEventSummaryRunId: string | null = null
  let runEventSummaryRequestId = 0
  let loadedRunEventSummaryKey: RunEventSummaryCacheKey | null = null
  let loadingRunEventSummaryKey: RunEventSummaryCacheKey | null = null
  const runtimeDiagnosticsCacheWindow = createBuddyRuntimeRefreshCacheWindow(
    BUDDY_BACKEND_STATUS_MIN_REFRESH_MS,
  )
  const usageSnapshotCacheWindow = createBuddyRuntimeRefreshCacheWindow(
    BUDDY_USAGE_SNAPSHOT_MIN_REFRESH_MS,
  )
  let refreshGeneration = 0
  const backgroundRefreshQueue = createAsyncEventQueue({
    onError(error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    },
    schedule: 'postPaint',
  })

  async function refresh() {
    const generation = ++refreshGeneration
    const plan = createBuddyRuntimeRefreshPlan()
    isLoading.value = true
    errorMessage.value = null

    try {
      const [
        runtimeStatus,
        settings,
        localStateStatus,
        runList,
        approvalList,
      ] = await Promise.all([
        loadBuddyRuntimeStatus(),
        loadBuddyAppSettings(),
        loadBuddyLocalStateStatus(),
        listBuddyRuns(),
        listBuddyApprovals({ status: 'pending' }),
      ])
      if (generation !== refreshGeneration)
        return

      status.value = runtimeStatus
      appSettings.value = settings
      localState.value = localStateStatus
      approvals.value = approvalList
      runs.value = runList
      queueBackgroundRefresh(plan.backgroundTasks, runList, generation)
    }
    catch (error) {
      status.value = createBrowserRuntimeStatus()
      appSettings.value = createBrowserAppSettings()
      codexRuntimeStatus.value = createBrowserCodexRuntimeStatus()
      claudeRuntimeStatus.value = createBrowserClaudeRuntimeStatus()
      runtimeDiagnostics.value = createBrowserRuntimeDiagnostics()
      localState.value = createBrowserLocalStateStatus()
      usageSnapshot.value = createBrowserUsageSnapshot()
      approvals.value = []
      runs.value = []
      runEventCounts.value = []
      clearRunEventSummarySelection()
      errorMessage.value = normalizeBuddyCommandError(error).message
    }
    finally {
      if (generation === refreshGeneration)
        isLoading.value = false
    }
  }

  function queueBackgroundRefresh(
    tasks: ReturnType<typeof createBuddyRuntimeRefreshPlan>['backgroundTasks'],
    runList: ReadonlyArray<BuddyRun>,
    generation: number,
  ) {
    if (tasks.includes('runtimeDiagnostics')) {
      enqueueBackgroundRefresh('control:runtime-diagnostics', generation, () =>
        refreshRuntimeDiagnostics(generation))
    }

    if (tasks.includes('usageSnapshot')) {
      enqueueBackgroundRefresh('control:usage-snapshot', generation, () =>
        refreshUsageSnapshot(generation))
    }

    if (tasks.includes('runEventCounts')) {
      enqueueBackgroundRefresh('control:run-event-counts', generation, () =>
        refreshRunEventCounts(runList, generation))
    }
  }

  function enqueueBackgroundRefresh(
    key: string,
    generation: number,
    task: () => Promise<void>,
  ) {
    backgroundRefreshQueue.enqueue(key, async () => {
      try {
        await task()
      }
      catch (error) {
        if (generation === refreshGeneration)
          errorMessage.value = normalizeBuddyCommandError(error).message
      }
    })
  }

  async function refreshRuntimeDiagnostics(generation: number) {
    const nextRuntimeDiagnostics = await loadRuntimeDiagnostics()
    if (generation !== refreshGeneration)
      return

    runtimeDiagnostics.value = nextRuntimeDiagnostics.value
    codexRuntimeStatus.value = nextRuntimeDiagnostics.value.codex.status
    claudeRuntimeStatus.value = nextRuntimeDiagnostics.value.claude.status
    if (nextRuntimeDiagnostics.loadedAt !== null)
      runtimeDiagnosticsCacheWindow.markCommitted(nextRuntimeDiagnostics.loadedAt)
  }

  async function refreshUsageSnapshot(generation: number) {
    const nextUsageSnapshot = await loadUsageSnapshot()
    if (generation !== refreshGeneration)
      return

    usageSnapshot.value = nextUsageSnapshot.value
    if (nextUsageSnapshot.loadedAt !== null)
      usageSnapshotCacheWindow.markCommitted(nextUsageSnapshot.loadedAt)
  }

  async function refreshRunEventCounts(
    runList: ReadonlyArray<BuddyRun>,
    generation: number,
  ) {
    const nextRunEventCounts = runList.length > 0
      ? await countBuddyRunEvents(runList.map(run => run.id))
      : []
    if (generation !== refreshGeneration)
      return

    runEventCounts.value = nextRunEventCounts
    if (
      selectedRunEventSummaryRunId
      && !runList.some(run => run.id === selectedRunEventSummaryRunId)
    ) {
      clearRunEventSummarySelection()
    }
  }

  async function loadRunEventSummaries(runId: string) {
    if (!runId)
      return

    const cacheKey = createRunEventSummaryCacheKey(runId)
    if (
      selectedRunEventSummaryRunId === runId
      && !isLoadingRunEventSummaries.value
      && isSameRunEventSummaryCacheKey(loadedRunEventSummaryKey, cacheKey)
    ) {
      return
    }
    if (isSameRunEventSummaryCacheKey(loadingRunEventSummaryKey, cacheKey))
      return

    const generation = refreshGeneration
    const requestId = ++runEventSummaryRequestId
    selectedRunEventSummaryRunId = runId
    loadingRunEventSummaryKey = cacheKey
    runEventSummaries.value = []
    isLoadingRunEventSummaries.value = true
    try {
      const summaries = await listBuddyRunEventSummaries({
        limit: 200,
        payloadPreviewChars: 360,
        runId,
      })
      if (
        requestId !== runEventSummaryRequestId
        || generation !== refreshGeneration
        || selectedRunEventSummaryRunId !== runId
      ) {
        return
      }

      runEventSummaries.value = summaries
      loadedRunEventSummaryKey = cacheKey
    }
    catch (error) {
      if (
        requestId === runEventSummaryRequestId
        && generation === refreshGeneration
        && selectedRunEventSummaryRunId === runId
      ) {
        errorMessage.value = normalizeBuddyCommandError(error).message
      }
    }
    finally {
      if (requestId === runEventSummaryRequestId && selectedRunEventSummaryRunId === runId) {
        loadingRunEventSummaryKey = null
        isLoadingRunEventSummaries.value = false
      }
    }
  }

  function createRunEventSummaryCacheKey(runId: string): RunEventSummaryCacheKey {
    return {
      eventCount: runEventCounts.value.find(count => count.runId === runId)?.eventCount ?? null,
      runId,
    }
  }

  function isSameRunEventSummaryCacheKey(
    left: RunEventSummaryCacheKey | null,
    right: RunEventSummaryCacheKey,
  ) {
    return left?.runId === right.runId && left.eventCount === right.eventCount
  }

  function clearRunEventSummarySelection() {
    selectedRunEventSummaryRunId = null
    loadedRunEventSummaryKey = null
    loadingRunEventSummaryKey = null
    runEventSummaryRequestId += 1
    runEventSummaries.value = []
    isLoadingRunEventSummaries.value = false
  }

  async function loadRuntimeDiagnostics(): Promise<LoadedRuntimeValue<BuddyRuntimeDiagnostics>> {
    const now = Date.now()
    if (runtimeDiagnosticsCacheWindow.shouldReuse(now)) {
      return {
        loadedAt: null,
        value: runtimeDiagnostics.value,
      }
    }

    const value = await loadBuddyRuntimeDiagnostics()
    return {
      loadedAt: Date.now(),
      value,
    }
  }

  async function loadUsageSnapshot(): Promise<LoadedRuntimeValue<BuddyUsageSnapshot>> {
    const now = Date.now()
    if (usageSnapshotCacheWindow.shouldReuse(now)) {
      return {
        loadedAt: null,
        value: usageSnapshot.value,
      }
    }

    const value = await loadBuddyUsageSnapshot()
    return {
      loadedAt: Date.now(),
      value,
    }
  }

  async function updateAppSettings(request: UpdateBuddyAppSettingsRequest) {
    isUpdatingAppSettings.value = true
    errorMessage.value = null

    try {
      if (!isTauriRuntime()) {
        const nextSettings = {
          ...appSettings.value,
          ...request,
          runtimeDialogVisibility: request.runtimeDialogVisibility
            ?? appSettings.value.runtimeDialogVisibility,
        }
        appSettings.value = nextSettings
        writeBrowserAppSettings(nextSettings)
        return
      }

      appSettings.value = await updateBuddyAppSettings(request)
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    }
    finally {
      isUpdatingAppSettings.value = false
    }
  }

  async function approveApproval(approvalId: string, approvalKind: string) {
    if (!approvalId || isResolvingApproval.value)
      return false

    isResolvingApproval.value = true
    errorMessage.value = null

    try {
      if (approvalKind === CODEX_APP_SERVER_REQUEST_APPROVAL_KIND)
        await approveBuddyCodexAppServerRequestApproval(approvalId)
      else
        await approveBuddyReadOnlyTask(approvalId)

      await refresh()
      return true
    }
    catch (error) {
      const message = normalizeBuddyCommandError(error).message
      await refresh()
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
      await denyBuddyApproval(approvalId)
      await refresh()
      return true
    }
    catch (error) {
      const message = normalizeBuddyCommandError(error).message
      await refresh()
      errorMessage.value = message
      return false
    }
    finally {
      isResolvingApproval.value = false
    }
  }

  onMounted(() => {
    void refresh()
    void listenBuddyAppSettingsChanged((settings) => {
      appSettings.value = settings
    }).then((unlisten) => {
      unlistenAppSettingsChanged = unlisten
    }).catch((error) => {
      console.error('Lexora settings listener failed', error)
    })
  })

  onUnmounted(() => {
    unlistenAppSettingsChanged?.()
    unlistenAppSettingsChanged = null
    backgroundRefreshQueue.dispose()
  })

  return {
    appSettings: readonly(appSettings),
    approvals: readonly(approvals),
    approveApproval,
    runtimeDiagnostics: readonly(runtimeDiagnostics),
    claudeRuntimeStatus: readonly(claudeRuntimeStatus),
    codexRuntimeStatus: readonly(codexRuntimeStatus),
    denyApproval,
    errorMessage: readonly(errorMessage),
    isLoading: readonly(isLoading),
    isLoadingRunEventSummaries: readonly(isLoadingRunEventSummaries),
    isResolvingApproval: readonly(isResolvingApproval),
    isUpdatingAppSettings: readonly(isUpdatingAppSettings),
    localState: readonly(localState),
    loadRunEventSummaries,
    refresh,
    runEventCounts: readonly(runEventCounts),
    runEventSummaries: readonly(runEventSummaries),
    runs: readonly(runs),
    status: readonly(status),
    updateAppSettings,
    usageSnapshot: readonly(usageSnapshot),
  }
}
