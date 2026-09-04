export const BUDDY_EXECUTION_PROFILES = [
  'read_only',
  'workspace_write',
  'full_access',
] as const

export type BuddyExecutionProfile = typeof BUDDY_EXECUTION_PROFILES[number]

export const BUDDY_DEFAULT_EXECUTION_PROFILE: BuddyExecutionProfile = 'workspace_write'
