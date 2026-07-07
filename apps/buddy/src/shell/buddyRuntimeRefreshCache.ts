export interface BuddyRuntimeRefreshCacheWindow {
  markCommitted: (loadedAt: number) => void
  shouldReuse: (now: number) => boolean
}

export function createBuddyRuntimeRefreshCacheWindow(
  minRefreshMs: number,
): BuddyRuntimeRefreshCacheWindow {
  let lastCommittedAt = 0

  return {
    markCommitted(loadedAt) {
      lastCommittedAt = loadedAt
    },
    shouldReuse(now) {
      return now - lastCommittedAt < minRefreshMs
    },
  }
}
