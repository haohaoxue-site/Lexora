export const BUDDY_APPROVAL_POLICIES = [
  'manual',
  'policy',
] as const

export type BuddyApprovalPolicy = typeof BUDDY_APPROVAL_POLICIES[number]

export const BUDDY_DEFAULT_APPROVAL_POLICY: BuddyApprovalPolicy = 'policy'
