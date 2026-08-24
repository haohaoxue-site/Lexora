export const BUDDY_SESSION_MODES = ['interactive', 'automation_background'] as const

export type BuddySessionMode = typeof BUDDY_SESSION_MODES[number]
