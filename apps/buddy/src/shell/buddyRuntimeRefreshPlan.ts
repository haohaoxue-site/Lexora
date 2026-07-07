export type BuddyRuntimeImmediateRefreshTask
  = | 'runtimeStatus'
    | 'appSettings'
    | 'localStateStatus'
    | 'runs'

export type BuddyRuntimeBackgroundRefreshTask
  = | 'runtimeDiagnostics'
    | 'usageSnapshot'
    | 'runEventCounts'

export interface BuddyRuntimeRefreshPlan {
  immediateTasks: ReadonlyArray<BuddyRuntimeImmediateRefreshTask>
  backgroundTasks: ReadonlyArray<BuddyRuntimeBackgroundRefreshTask>
}

export function createBuddyRuntimeRefreshPlan(): BuddyRuntimeRefreshPlan {
  return {
    immediateTasks: [
      'runtimeStatus',
      'appSettings',
      'localStateStatus',
      'runs',
    ],
    backgroundTasks: [
      'runtimeDiagnostics',
      'usageSnapshot',
      'runEventCounts',
    ],
  }
}
