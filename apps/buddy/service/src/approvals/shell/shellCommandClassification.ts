export type ShellCommandApprovalReason
  = 'unsafe-arguments'
    | 'unsupported-syntax'
    | 'unknown-command'

export type ShellCommandClassification
  = { type: 'auto-approve' }
    | { type: 'approval-required', reason: ShellCommandApprovalReason }

export function requireShellApproval(
  reason: ShellCommandApprovalReason,
): ShellCommandClassification {
  return { type: 'approval-required', reason }
}
