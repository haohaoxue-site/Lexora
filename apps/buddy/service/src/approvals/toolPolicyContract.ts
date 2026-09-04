import type { ApprovalReviewKind } from '../../../shared/approvalReviewPayload'

export type ToolDecision
  = { type: 'allow' }
    | { type: 'deny', code: string }
    | { type: 'ask', forceAsk?: boolean, kind: ApprovalReviewKind, summary: string }

export interface ShellCommandPolicy {
  decide: (command: string) => ToolDecision
}
