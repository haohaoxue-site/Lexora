import type {
  ApprovalReviewKind,
  AutomationApprovalReviewInput,
  BrowserApprovalReviewInput,
  PathApprovalReviewInput,
  SystemActionApprovalReviewInput,
} from '../../../shared/approvalReviewPayload'
import type { AccessKind, PermissionPath } from '../permissions/permissionContract'

export interface BuddyToolClassification {
  access?: AccessKind
  approval?: {
    automation?: AutomationApprovalReviewInput
    browser?: BrowserApprovalReviewInput
    kind?: ApprovalReviewKind
    paths?: PathApprovalReviewInput
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  }
  forceAsk?: boolean
  paths?: readonly PermissionPath[]
  validateBeforeExecution?: () => Promise<BuddyToolClassificationFailure | null>
}

export interface BuddyToolClassificationFailure {
  blocked: true
  reason: string
}

export type BuddyToolClassificationResult
  = BuddyToolClassification | BuddyToolClassificationFailure

export function createToolClassificationFailure(
  reason: string,
): BuddyToolClassificationFailure {
  return { blocked: true, reason }
}

export function isToolClassificationFailure(
  result: BuddyToolClassificationResult,
): result is BuddyToolClassificationFailure {
  return 'blocked' in result
}
