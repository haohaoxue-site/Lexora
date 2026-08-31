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
  BuddyToolClassification,
  BuddyToolClassificationResult,
} from '../../approvals/toolClassification'
import type { ToolApprovalKind } from '../../approvals/toolPolicyContract'
import type { ProjectGrant } from '../../projects/resolveGrantedPath'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { createToolApprovalScopeKey } from '../../approvals/toolApprovalScope'
import { isToolClassificationFailure } from '../../approvals/toolClassification'
import { ToolPolicy } from '../../approvals/ToolPolicy'
import { readToolCallBlockReason } from '../../approvals/toolPolicyContract'
import { PI_BUILTIN_TOOL_NAME_SET } from '../piBuiltinTools'

export interface ToolApprovalGateway {
  request: (input: {
    allowForTurn: boolean
    arguments: unknown
    automation?: AutomationApprovalReviewInput
    kind: ToolApprovalKind
    runId: string
    scopeKey: string
    signal: AbortSignal
    summary: string
    systemAction?: SystemActionApprovalReviewInput
    toolCallId: string
    toolName: string
  }) => Promise<'approved' | 'denied'>
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
  ) => BuddyToolClassificationResult | null | undefined | Promise<BuddyToolClassificationResult | null | undefined>
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
    const classification = await options.classifyTool?.(event, run)
    if (classification && isToolClassificationFailure(classification))
      return block(classification.reason)
    const declared = classification ?? {}
    if (declared.alwaysConfirm) {
      const approval = declared.approval
      if (!approval?.kind)
        return block('VALIDATION_FAILED')
      return await requestApproval(options, event, run, {
        allowForTurn: false,
        automation: approval.automation,
        kind: approval.kind,
        paths: declared.paths,
        resource: declared.resource,
        risk: declared.risk,
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

    return await requestApproval(options, event, run, {
      allowForTurn: true,
      automation: declared.approval?.automation,
      kind: decision.kind,
      paths: declared.paths,
      resource: declared.resource,
      risk: declared.risk,
      summary: declared.approval?.summary ?? decision.summary,
      systemAction: declared.approval?.systemAction,
    })
  }
  catch (error) {
    return block(readToolCallBlockReason(error) ?? 'TOOL_POLICY_FAILED')
  }
}

async function requestApproval(
  options: CreateToolPolicyExtensionOptions,
  event: ToolCallEvent,
  run: BuddyRunContext,
  review: {
    allowForTurn: boolean
    automation?: AutomationApprovalReviewInput
    kind: ToolApprovalKind
    paths?: BuddyToolClassification['paths']
    resource?: BuddyToolClassification['resource']
    risk?: BuddyToolClassification['risk']
    summary: string
    systemAction?: SystemActionApprovalReviewInput
  },
): Promise<ToolCallEventResult | void> {
  const approval = await options.approvalService.request({
    allowForTurn: review.allowForTurn,
    arguments: event.input,
    automation: review.automation,
    kind: review.kind,
    runId: run.runId,
    scopeKey: createToolApprovalScopeKey({
      arguments: event.input,
      kind: review.kind,
      paths: review.paths,
      resource: review.resource,
      risk: review.risk,
      toolName: event.toolName,
    }),
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
