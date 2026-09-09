import type { ShellApprovalReason } from '../../../../shared/permissions/approvalReviewPayload'

export type ShellCommandApprovalReason = Extract<
  ShellApprovalReason,
  'unsafe-arguments' | 'unsupported-syntax' | 'unknown-command'
>

export type ShellCommandClassification
  = {
    type: 'auto-approve'
    git?: boolean
    gitDiffs?: readonly (readonly string[])[]
    readPaths?: readonly string[]
  }
  | { type: 'approval-required', reason: ShellCommandApprovalReason, readPaths?: readonly string[] }

export function requireShellApproval(
  reason: ShellCommandApprovalReason,
): ShellCommandClassification {
  return { type: 'approval-required', reason }
}
