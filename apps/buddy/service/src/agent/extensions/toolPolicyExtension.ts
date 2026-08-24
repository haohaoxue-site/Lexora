import type {
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent'
import type {
  AutomationApprovalReviewInput,
  SystemActionApprovalReviewInput,
} from '../../../../shared/approvalReviewPayload'
import type { BuddyExecutionProfile } from '../../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../../shared/modelSelection'

import type {
  ToolApprovalKind,
  ToolPolicyPath,
  ToolRisk,
} from '../../approvals/ToolPolicy'
import type { ProjectGrant } from '../../projects/resolveGrantedPath'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { ToolPolicy } from '../../approvals/ToolPolicy'
import { SystemCapabilityError } from '../../system/systemCapability'
import { serializeSystemToolFailure } from '../../system/systemToolFailure'

const BUILTIN_TOOLS = new Set(['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write'])

export interface ToolApprovalGateway {
  request: (input: {
    arguments: unknown
    automation?: AutomationApprovalReviewInput
    kind: ToolApprovalKind
    runId: string
    signal: AbortSignal
    summary: string
    systemAction?: SystemActionApprovalReviewInput
    toolCallId: string
    toolName: string
  }) => Promise<'approved' | 'denied'>
}

export interface BuddyToolClassification {
  approval?: {
    automation?: AutomationApprovalReviewInput
    kind?: ToolApprovalKind
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  }
  alwaysConfirm?: boolean
  origin?: 'builtin' | 'first-party' | 'mcp'
  paths?: readonly ToolPolicyPath[]
  resource?: { kind?: 'connector' | 'project', projectId: string, trusted: boolean }
  risk?: ToolRisk
}

export interface BuddyRunContext {
  runId: string
  serviceTier?: BuddyServiceTier | null
  signal: AbortSignal
}

export interface CreateToolPolicyExtensionOptions {
  approvalService: ToolApprovalGateway
  classifyTool?: (event: ToolCallEvent) => BuddyToolClassification
  cwd: string
  executionProfile: BuddyExecutionProfile
  getGrants: () => readonly ProjectGrant[]
  getRunContext: () => BuddyRunContext | null
  toolPolicy?: ToolPolicy
}

export function createToolPolicyExtension(
  options: CreateToolPolicyExtensionOptions,
): BuddyInProcessExtension {
  const toolPolicy = options.toolPolicy ?? new ToolPolicy()
  return {
    name: 'lexora-tool-policy',
    factory(pi) {
      pi.on('tool_call', async event => decideToolCall(options, toolPolicy, event))
    },
  }
}

async function decideToolCall(
  options: CreateToolPolicyExtensionOptions,
  toolPolicy: ToolPolicy,
  event: ToolCallEvent,
): Promise<ToolCallEventResult | void> {
  try {
    const declared = options.classifyTool?.(event) ?? {}
    if (declared.alwaysConfirm) {
      const approval = declared.approval
      if (!approval?.kind)
        return block('VALIDATION_FAILED')
      return requestApproval(options, event, {
        automation: approval.automation,
        kind: approval.kind,
        summary: approval.summary,
        systemAction: approval.systemAction,
      })
    }
    if (options.executionProfile === 'full_access')
      return
    const decision = await toolPolicy.decide({
      arguments: event.input,
      cwd: options.cwd,
      grants: options.getGrants(),
      origin: BUILTIN_TOOLS.has(event.toolName) ? 'builtin' : declared.origin,
      paths: declared.paths,
      resource: declared.resource,
      risk: declared.risk,
      toolName: event.toolName,
    })
    if (decision.type === 'allow')
      return
    if (decision.type === 'deny')
      return block(decision.code)

    return requestApproval(options, event, {
      automation: declared.approval?.automation,
      kind: decision.kind,
      summary: declared.approval?.summary ?? decision.summary,
      systemAction: declared.approval?.systemAction,
    })
  }
  catch (error) {
    return block(readBlockedToolReason(error))
  }
}

async function requestApproval(
  options: CreateToolPolicyExtensionOptions,
  event: ToolCallEvent,
  review: {
    automation?: AutomationApprovalReviewInput
    kind: ToolApprovalKind
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  },
): Promise<ToolCallEventResult | void> {
  const run = options.getRunContext()
  if (!run)
    return block('RUN_CONTEXT_UNAVAILABLE')
  const approval = await options.approvalService.request({
    arguments: event.input,
    automation: review.automation,
    kind: review.kind,
    runId: run.runId,
    signal: run.signal,
    summary: review.summary,
    systemAction: review.systemAction,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  })
  return approval === 'approved' ? undefined : block('APPROVAL_DENIED')
}

function block(reason: string): ToolCallEventResult {
  return { block: true, reason, terminate: false }
}

function readBlockedToolReason(error: unknown): string {
  return error instanceof SystemCapabilityError
    ? serializeSystemToolFailure(error.code)
    : readStableErrorCode(error)
}

function readStableErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error))
    return 'TOOL_POLICY_FAILED'
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string')
    return 'TOOL_POLICY_FAILED'
  if (new Set([
    'APPROVAL_CANCELLED',
    'AUTOMATION_CONFLICT',
    'AUTOMATION_APPROVAL_EXPIRED',
    'AUTOMATION_INVALID_SCHEDULE',
    'AUTOMATION_NOT_FOUND',
    'INVALID_PATH',
    'PATH_NOT_FOUND',
    'PATH_OUTSIDE_GRANTED_DIRECTORY',
    'SYSTEM_ACTION_INVALID',
    'SYSTEM_ACTION_NOT_ALLOWED',
    'SYSTEM_TARGET_CHANGED',
    'SYSTEM_TARGET_EXPIRED',
    'SYSTEM_TARGET_UNKNOWN',
    'VALIDATION_FAILED',
  ]).has(code)) {
    return code
  }
  return 'TOOL_POLICY_FAILED'
}
