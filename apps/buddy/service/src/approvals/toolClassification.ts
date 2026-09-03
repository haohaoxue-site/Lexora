import type {
  AutomationApprovalReviewInput,
  BrowserApprovalReviewInput,
  SystemActionApprovalReviewInput,
} from '../../../shared/approvalReviewPayload'
import type {
  ToolApprovalKind,
  ToolPolicyPath,
  ToolRisk,
} from './toolPolicyContract'

export interface BuddyToolClassification {
  approval?: {
    automation?: AutomationApprovalReviewInput
    browser?: BrowserApprovalReviewInput
    kind?: ToolApprovalKind
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  }
  alwaysConfirm?: boolean
  paths?: readonly ToolPolicyPath[]
  resource?: { id: string, kind?: 'connector' | 'space', trusted: boolean }
  risk?: ToolRisk
  source?: 'lexora' | 'mcp' | 'pi'
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
