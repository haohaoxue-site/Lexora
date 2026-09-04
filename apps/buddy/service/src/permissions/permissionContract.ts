import type { BuddyApprovalPolicy } from '../../../shared/approvalPolicy'
import type { ApprovalReviewKind } from '../../../shared/approvalReviewPayload'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'

export type AccessKind
  = 'delete'
    | 'execute'
    | 'interaction'
    | 'network'
    | 'read'
    | 'render'
    | 'visual'
    | 'write'

export type PathZone = 'granted' | 'outside' | 'sensitive' | 'workspace'

export type PermissionDenialSource = 'invalid' | 'profile' | 'sensitive'

export type PermissionDenialCode
  = 'APPROVAL_UNAVAILABLE_IN_BACKGROUND'
    | 'MULTIPLE_DIRECTORY_GRANTS_REQUIRED'
    | 'INVALID_PATH'
    | 'PATH_NOT_FOUND'
    | 'READ_ONLY_PROFILE'
    | 'SENSITIVE_PATH'
    | 'VALIDATION_FAILED'

export type GrantOwnerKind = 'conversation' | 'space'

export interface GrantOwner {
  id: string
  kind: GrantOwnerKind
}

export interface PermissionGrant {
  canonicalRoot: string
  grantId: string
  kind: 'granted' | 'workspace'
  root: string
}

export type PermissionPathMode = 'create' | 'existing'

export interface PermissionPath {
  mode: PermissionPathMode
  path: string
}

export interface GrantProposal {
  owner: GrantOwner
  root: string
}

export type PermissionDecision
  = {
    allowForTurn: boolean
    grant?: GrantProposal
    kind: ApprovalReviewKind
    paths?: readonly { path: string, zone: PathZone }[]
    summary: string
    type: 'ask'
  }
  | { type: 'allow' }
  | {
    code: PermissionDenialCode
    source: PermissionDenialSource
    type: 'deny'
  }

export interface PermissionRequest {
  access?: AccessKind
  approvalPolicy: BuddyApprovalPolicy
  approvalAvailable: boolean
  approval?: { kind?: ApprovalReviewKind, summary?: string }
  arguments: unknown
  cwd: string
  forceAsk?: boolean
  grants: readonly PermissionGrant[]
  owner: GrantOwner
  paths?: readonly PermissionPath[]
  profile: BuddyExecutionProfile
  toolName: string
}

export function allow(): PermissionDecision {
  return { type: 'allow' }
}

export function deny(
  code: PermissionDenialCode,
  source: PermissionDenialSource,
): PermissionDecision {
  return { code, source, type: 'deny' }
}

export function ask(input: {
  allowForTurn?: boolean
  grant?: GrantProposal
  kind: ApprovalReviewKind
  paths?: readonly { path: string, zone: PathZone }[]
  summary: string
}): PermissionDecision {
  return {
    allowForTurn: input.allowForTurn ?? true,
    ...(input.grant ? { grant: input.grant } : {}),
    kind: input.kind,
    ...(input.paths?.length ? { paths: input.paths } : {}),
    summary: input.summary,
    type: 'ask',
  }
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
