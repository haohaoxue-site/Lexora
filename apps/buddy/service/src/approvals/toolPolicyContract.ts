import type { ApprovalReviewKind, ShellApprovalReason } from '../../../shared/permissions/approvalReviewPayload'

export type ToolDecision
  = { type: 'allow', readPaths?: readonly string[], readFiles?: readonly string[] }
    | { type: 'deny', code: string }
    | {
      type: 'ask'
      forceAsk?: boolean
      kind: ApprovalReviewKind
      reason?: ShellApprovalReason
      readPaths?: readonly string[]
      readFiles?: readonly string[]
      summary: string
    }

export interface ShellCommandPolicy {
  decide: (command: string, cwd: string) => ToolDecision | Promise<ToolDecision>
}
