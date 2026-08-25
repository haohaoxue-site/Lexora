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
import { PI_BUILTIN_TOOL_NAME_SET } from '../piBuiltinTools'

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
  source?: 'lexora' | 'mcp' | 'pi'
  paths?: readonly ToolPolicyPath[]
  resource?: { kind?: 'connector' | 'project', projectId: string, trusted: boolean }
  risk?: ToolRisk
}

export interface BuddyRunContext {
  flushProjectedEvents: () => Promise<void>
  onToolExecutionAuthorized: (event: {
    arguments: unknown
    toolCallId: string
    toolName: string
  }) => Promise<void>
  runId: string
  serviceTier?: BuddyServiceTier | null
  signal: AbortSignal
}

export interface CreateToolPolicyExtensionOptions {
  approvalService: ToolApprovalGateway
  classifyTool?: (
    event: ToolCallEvent,
    run: BuddyRunContext,
  ) => BuddyToolClassification | null | undefined | Promise<BuddyToolClassification | null | undefined>
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
    const run = options.getRunContext()
    if (!run)
      return block('RUN_CONTEXT_UNAVAILABLE')
    await run.flushProjectedEvents()
    const declared = (await options.classifyTool?.(event, run)) ?? {}
    if (declared.alwaysConfirm) {
      const approval = declared.approval
      if (!approval?.kind)
        return block('VALIDATION_FAILED')
      return requestApproval(options, event, run, {
        automation: approval.automation,
        kind: approval.kind,
        summary: approval.summary,
        systemAction: approval.systemAction,
      })
    }
    if (options.executionProfile === 'full_access')
      return authorizeToolExecution(run, event)
    const decision = await toolPolicy.decide({
      arguments: event.input,
      cwd: options.cwd,
      grants: options.getGrants(),
      paths: declared.paths,
      resource: declared.resource,
      risk: declared.risk,
      source: PI_BUILTIN_TOOL_NAME_SET.has(event.toolName) ? 'pi' : declared.source,
      toolName: event.toolName,
    })
    if (decision.type === 'allow')
      return authorizeToolExecution(run, event)
    if (decision.type === 'deny')
      return block(decision.code)

    return requestApproval(options, event, run, {
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
  run: BuddyRunContext,
  review: {
    automation?: AutomationApprovalReviewInput
    kind: ToolApprovalKind
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  },
): Promise<ToolCallEventResult | void> {
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
  return approval === 'approved'
    ? authorizeToolExecution(run, event)
    : block('APPROVAL_DENIED')
}

async function authorizeToolExecution(
  run: BuddyRunContext,
  event: ToolCallEvent,
): Promise<void> {
  await run.onToolExecutionAuthorized({
    arguments: event.input,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  })
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
    'SYSTEM_ACTION_CHANGED',
    'SYSTEM_ACTION_EXPIRED',
    'SYSTEM_ACTION_INVALID',
    'SYSTEM_ACTION_NOT_ALLOWED',
    'SYSTEM_ACTION_NOT_PREPARED',
    'SYSTEM_TARGET_AMBIGUOUS',
    'SYSTEM_TARGET_CHANGED',
    'SYSTEM_TARGET_NOT_FOUND',
    'VALIDATION_FAILED',
  ]).has(code)) {
    return code
  }
  return 'TOOL_POLICY_FAILED'
}
