export const BUDDY_EXECUTION_PROFILES = ['controlled', 'full_access'] as const

export type BuddyExecutionProfile = typeof BUDDY_EXECUTION_PROFILES[number]

export const BUDDY_DEFAULT_EXECUTION_PROFILE: BuddyExecutionProfile = 'controlled'
