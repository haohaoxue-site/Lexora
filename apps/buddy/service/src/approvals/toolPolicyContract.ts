import type { ApprovalReviewKind } from '../../../shared/approvalReviewPayload'
import type { DirectoryGrant, GrantedPathMode } from '../directories/resolveGrantedPath'

export type ToolApprovalKind = ApprovalReviewKind
export type ToolRisk
  = 'authorization'
    | 'delete'
    | 'interaction'
    | 'mcp'
    | 'network'
    | 'read'
    | 'system'
    | 'visual'
    | 'write'
export type ToolPolicyDenialCode
  = 'INVALID_PATH'
    | 'PATH_NOT_FOUND'
    | 'PATH_OUTSIDE_GRANTED_DIRECTORY'
    | 'UNTRUSTED_RESOURCE'
    | 'VALIDATION_FAILED'

export type ToolDecision
  = { type: 'allow' }
    | { type: 'deny', code: ToolPolicyDenialCode }
    | { type: 'ask', kind: ToolApprovalKind, summary: string }

export interface ToolPolicyPath {
  mode: GrantedPathMode
  path: string
}

export interface ToolPolicyRequest {
  arguments: unknown
  cwd: string
  grants: readonly DirectoryGrant[]
  paths?: readonly ToolPolicyPath[]
  resource?: { id: string, kind?: 'connector' | 'space', trusted: boolean }
  risk?: ToolRisk
  source?: 'lexora' | 'mcp' | 'pi'
  toolName: string
}

export interface ShellCommandPolicy {
  decide: (command: string) => ToolDecision
}

export interface ToolCallBlockingError {
  readonly toolCallBlockReason: string
}

export function readToolCallBlockReason(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('toolCallBlockReason' in error))
    return null
  const reason = (error as { toolCallBlockReason?: unknown }).toolCallBlockReason
  return typeof reason === 'string' && reason.length > 0 && reason.length <= 4_096
    ? reason
    : null
}
