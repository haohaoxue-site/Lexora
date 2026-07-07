export interface BuddyRunEventSignalGate {
  dispose: () => void
  signalRun: (runId: string) => void
  waitForRun: (runId: string, fallbackMs: number) => Promise<void>
}

interface BuddyRunEventSignalWaiter {
  resolve: () => void
  timer: ReturnType<typeof setTimeout>
}

export function createBuddyRunEventSignalGate(): BuddyRunEventSignalGate {
  const pendingSignals = new Set<string>()
  const waitersByRunId = new Map<string, Set<BuddyRunEventSignalWaiter>>()

  function signalRun(runId: string) {
    const waiters = waitersByRunId.get(runId)
    if (!waiters || waiters.size === 0) {
      pendingSignals.add(runId)
      return
    }

    settleRun(runId, waiters)
  }

  function waitForRun(runId: string, fallbackMs: number) {
    if (pendingSignals.delete(runId))
      return Promise.resolve()

    return new Promise<void>((resolve) => {
      const waiter = {} as BuddyRunEventSignalWaiter
      waiter.resolve = resolve
      waiter.timer = setTimeout(settleWaiter, fallbackMs, runId, waiter)
      const waiters = waitersByRunId.get(runId) ?? new Set<BuddyRunEventSignalWaiter>()
      waiters.add(waiter)
      waitersByRunId.set(runId, waiters)
    })
  }

  function dispose() {
    pendingSignals.clear()
    for (const [runId, waiters] of waitersByRunId)
      settleRun(runId, waiters)
  }

  function settleRun(runId: string, waiters: Set<BuddyRunEventSignalWaiter>) {
    waitersByRunId.delete(runId)
    for (const waiter of waiters) {
      clearTimeout(waiter.timer)
      waiter.resolve()
    }
  }

  function settleWaiter(runId: string, waiter: BuddyRunEventSignalWaiter) {
    const waiters = waitersByRunId.get(runId)
    if (!waiters)
      return

    waiters.delete(waiter)
    if (waiters.size === 0)
      waitersByRunId.delete(runId)

    waiter.resolve()
  }

  return {
    dispose,
    signalRun,
    waitForRun,
  }
}
