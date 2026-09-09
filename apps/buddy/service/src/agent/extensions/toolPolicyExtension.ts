import type {
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent'
import type { BuddyApprovalPolicy } from '../../../../shared/permissions/approvalPolicy'
import type { PathApprovalReviewInput } from '../../../../shared/permissions/approvalReviewPayload'
import type { BuddyExecutionProfile } from '../../../../shared/permissions/executionProfile'
import type { ApprovalService } from '../../approvals/ApprovalService'
import type {
  BuddyToolClassification,
  BuddyToolClassificationResult,
} from '../../approvals/toolClassification'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type {
  GrantOwner,
  GrantProposal,
  PermissionDecision,
} from '../../permissions/permissionContract'
import type { BuddyExtensionRunContext } from './BuddyExtensionRunContext'
import type { BuddyInProcessExtension } from './BuddyInProcessExtension'
import { isToolClassificationFailure } from '../../approvals/toolClassification'
import { readToolCallBlockReason } from '../../permissions/permissionContract'
import { PermissionEngine } from '../../permissions/PermissionEngine'

export interface CreateToolPolicyExtensionOptions {
  approvalService: Pick<ApprovalService, 'request'>
  classifyTool?: (
    event: ToolCallEvent,
    run: BuddyExtensionRunContext,
  ) => BuddyToolClassificationResult | null | undefined | Promise<BuddyToolClassificationResult | null | undefined>
  cwd: string
  applyGrant?: (grant: GrantProposal) => Promise<void> | void
  approvalAvailable: boolean
  approvalPolicy: BuddyApprovalPolicy
  engine?: PermissionEngine
  executionProfile: BuddyExecutionProfile
  getGrants: () => readonly DirectoryGrant[]
  getRunContext: () => BuddyExtensionRunContext | null
  owner: GrantOwner
}

export function createToolPolicyExtension(
  options: CreateToolPolicyExtensionOptions,
): BuddyInProcessExtension {
  const engine = options.engine ?? new PermissionEngine()
  return {
    name: 'lexora-tool-policy',
    factory(pi) {
      pi.on('tool_call', async event => decideToolCall(options, engine, event))
    },
  }
}

async function decideToolCall(
  options: CreateToolPolicyExtensionOptions,
  engine: PermissionEngine,
  event: ToolCallEvent,
): Promise<ToolCallEventResult | void> {
  try {
    const run = options.getRunContext()
    if (!run)
      return block('RUN_CONTEXT_UNAVAILABLE')
    await run.flushProjectedEvents()

    const classification = await options.classifyTool?.(event, run)
    if (classification && isToolClassificationFailure(classification))
      return await deny(run, event, classification.reason)
    const declared: BuddyToolClassification = classification ?? {}

    const decision = await engine.decide({
      access: declared.access,
      approvalAvailable: options.approvalAvailable,
      approvalPolicy: options.approvalPolicy,
      approval: declared.approval
        ? { kind: declared.approval.kind, summary: declared.approval.summary }
        : undefined,
      arguments: event.input,
      cwd: options.cwd,
      forceAsk: declared.forceAsk,
      grants: options.getGrants(),
      owner: options.owner,
      paths: declared.paths,
      profile: options.executionProfile,
      toolName: event.toolName,
    })

    if (decision.type === 'deny')
      return await deny(run, event, decision.code)
    if (decision.type === 'allow')
      return authorizeToolExecution(run, event)
    return await requestApproval(options, event, run, decision, declared)
  }
  catch (error) {
    return block(readToolCallBlockReason(error) ?? 'TOOL_POLICY_FAILED')
  }
}

async function requestApproval(
  options: CreateToolPolicyExtensionOptions,
  event: ToolCallEvent,
  run: BuddyExtensionRunContext,
  decision: Extract<PermissionDecision, { type: 'ask' }>,
  declared: BuddyToolClassification,
): Promise<ToolCallEventResult | void> {
  const approval = await options.approvalService.request({
    allowForTurn: decision.allowForTurn,
    arguments: event.input,
    automation: declared.approval?.automation,
    browser: declared.approval?.browser,
    kind: decision.kind,
    paths: declared.approval?.paths ?? toPathReview(decision),
    runId: run.runId,
    signal: run.signal,
    summary: decision.summary,
    systemAction: declared.approval?.systemAction,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  })
  if (approval.decision === 'denied')
    return await deny(run, event, 'APPROVAL_DENIED')

  if (decision.grant && approval.decision === 'approved_once') {
    try {
      if (!options.applyGrant)
        throw new Error('Directory grant service is unavailable')
      await options.applyGrant(decision.grant)
    }
    catch {
      return await deny(run, event, 'DIRECTORY_GRANT_FAILED')
    }
  }

  const validation = await declared.validateBeforeExecution?.()
  if (validation)
    return await deny(run, event, validation.reason)
  return authorizeToolExecution(run, event)
}

function toPathReview(
  decision: Extract<PermissionDecision, { type: 'ask' }>,
): PathApprovalReviewInput | undefined {
  if (!decision.paths?.length)
    return undefined
  if (
    decision.kind !== 'delete'
    && decision.kind !== 'read'
    && decision.kind !== 'render'
    && decision.kind !== 'write'
  ) {
    return undefined
  }
  return {
    access: decision.kind,
    grant: decision.grant ? { owner: decision.grant.owner.kind, root: decision.grant.root } : null,
    targets: decision.paths.map(entry => ({ path: entry.path, zone: entry.zone })),
  }
}

async function authorizeToolExecution(
  run: BuddyExtensionRunContext,
  event: ToolCallEvent,
): Promise<void> {
  await run.onToolExecutionAuthorized({
    arguments: event.input,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  })
}

async function deny(
  run: BuddyExtensionRunContext,
  event: ToolCallEvent,
  denialCode: string,
): Promise<ToolCallEventResult> {
  await run.onToolExecutionDenied?.({
    denialCode,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  })
  return block(denialCode)
}

function block(reason: string): ToolCallEventResult {
  return { block: true, reason, terminate: false }
}
