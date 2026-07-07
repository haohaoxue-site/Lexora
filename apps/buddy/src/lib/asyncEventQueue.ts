export interface AsyncEventQueueTaskContext {
  isDisposed: () => boolean
  signal: AbortSignal
}

export type AsyncEventQueueTask = (context: AsyncEventQueueTaskContext) => Promise<void> | void

export type AsyncEventQueueSchedule = 'microtask' | 'postPaint'

export interface AsyncEventQueueFailure {
  error: unknown
  key: string
}

export interface AsyncEventQueueOptions {
  onError?: (error: unknown) => void
  schedule?: AsyncEventQueueSchedule
}

export interface AsyncEventQueueFlushResult {
  cancelled: number
  completed: number
  failed: AsyncEventQueueFailure[]
}

export interface AsyncEventQueue {
  clear: () => void
  clearPending: (key?: string) => void
  dispose: () => void
  enqueue: (key: string, task: AsyncEventQueueTask) => boolean
  flush: () => Promise<AsyncEventQueueFlushResult>
  isDisposed: () => boolean
  pendingCount: () => number
}

export function createAsyncEventQueue(
  options: AsyncEventQueueOptions = {},
): AsyncEventQueue {
  const pendingTasks = new Map<string, AsyncEventQueueTask>()
  const pendingKeys: string[] = []
  let drainPromise: Promise<AsyncEventQueueFlushResult> | null = null
  let activeController: AbortController | null = null
  let cancelledCount = 0
  let isDisposed = false
  let isDrainScheduled = false

  function enqueue(key: string, task: AsyncEventQueueTask) {
    assertQueueKey(key)

    if (isDisposed)
      return false

    if (!pendingTasks.has(key))
      pendingKeys.push(key)

    pendingTasks.set(key, task)
    scheduleDrain()
    return true
  }

  function clear() {
    clearPending()
  }

  function clearPending(key?: string) {
    if (key !== undefined) {
      assertQueueKey(key)
      if (pendingTasks.delete(key))
        cancelledCount += 1

      removePendingKey(key)
      return
    }

    cancelledCount += pendingTasks.size
    pendingTasks.clear()
    pendingKeys.length = 0
  }

  function dispose() {
    if (isDisposed)
      return

    isDisposed = true
    clearPending()
    activeController?.abort()
  }

  function readIsDisposed() {
    return isDisposed
  }

  function pendingCount() {
    return pendingTasks.size
  }

  function scheduleDrain() {
    if (isDrainScheduled || drainPromise)
      return

    isDrainScheduled = true
    scheduleDrainCallback(() => {
      isDrainScheduled = false
      void flush()
    })
  }

  function flush() {
    if (!drainPromise && pendingTasks.size === 0) {
      return Promise.resolve({
        cancelled: consumeCancelledCount(),
        completed: 0,
        failed: [],
      })
    }

    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null

        if (!isDisposed && pendingTasks.size > 0)
          scheduleDrain()
      })
    }

    return drainPromise
  }

  async function drain() {
    const result: AsyncEventQueueFlushResult = {
      cancelled: consumeCancelledCount(),
      completed: 0,
      failed: [],
    }

    while (pendingKeys.length > 0) {
      if (isDisposed)
        break

      const key = pendingKeys.shift()
      if (key === undefined)
        continue

      const task = pendingTasks.get(key)
      if (!task)
        continue

      pendingTasks.delete(key)
      activeController = new AbortController()

      try {
        await task({
          isDisposed: readIsDisposed,
          signal: activeController.signal,
        })
        result.completed += 1
      }
      catch (error) {
        options.onError?.(error)
        result.failed.push({ error, key })
      }
      finally {
        activeController = null
      }
    }

    result.cancelled += consumeCancelledCount()

    return result
  }

  function consumeCancelledCount() {
    const count = cancelledCount
    cancelledCount = 0
    return count
  }

  function removePendingKey(key: string) {
    const index = pendingKeys.indexOf(key)
    if (index >= 0)
      pendingKeys.splice(index, 1)
  }

  function scheduleDrainCallback(callback: () => void) {
    if (options.schedule !== 'postPaint') {
      queueMicrotask(callback)
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        setTimeout(callback, 0)
      })
      return
    }

    setTimeout(callback, 0)
  }

  return {
    clear,
    clearPending,
    dispose,
    enqueue,
    flush,
    isDisposed: readIsDisposed,
    pendingCount,
  }
}

function assertQueueKey(key: string) {
  if (key.trim().length === 0)
    throw new Error('Async event queue key must not be empty')
}
