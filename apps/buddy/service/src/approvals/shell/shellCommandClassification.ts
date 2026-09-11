import type { ShellApprovalReason } from '../../../../shared/permissions/approvalReviewPayload'

export type ShellCommandApprovalReason = Extract<
  ShellApprovalReason,
  'unsafe-arguments' | 'unsupported-syntax' | 'unknown-command'
>

export interface ShellFileOperation {
  access: 'delete'
  paths: readonly string[]
  type: 'file-operation'
}

export type ShellCommandClassification = ShellQueryClassification | ShellFileOperation

export type ShellQueryClassification
  = {
    type: 'auto-approve'
    git?: boolean
    gitDiffs?: readonly (readonly string[])[]
    readPaths?: readonly string[]
  }
  | { type: 'approval-required', reason: ShellCommandApprovalReason, readPaths?: readonly string[] }

export function requireShellApproval(
  reason: ShellCommandApprovalReason,
): Extract<ShellQueryClassification, { type: 'approval-required' }> {
  return { type: 'approval-required', reason }
}
