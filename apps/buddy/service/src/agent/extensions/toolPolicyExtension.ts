import type {
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent'
import type { BuddyServiceTier } from '../../../../shared/modelSelection'

import type {
  ToolPolicyPath,
  ToolRisk,
} from '../../approvals/ToolPolicy'
import type { ProjectGrant } from '../../projects/resolveGrantedPath'
import type { BundledLexoraExtension } from '../createBuddyResourceLoader'
import { ToolPolicy } from '../../approvals/ToolPolicy'

const BUILTIN_TOOLS = new Set(['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write'])

export interface ToolApprovalGateway {
  request: (input: {
    arguments: unknown
    kind: 'delete' | 'mcp' | 'network' | 'shell' | 'system'
    runId: string
    signal: AbortSignal
    summary: string
    toolCallId: string
    toolName: string
  }) => Promise<'approved' | 'denied'>
}

export interface BuddyToolClassification {
  origin?: 'builtin' | 'bundled' | 'mcp'
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
  getGrants: () => readonly ProjectGrant[]
  getRunContext: () => BuddyRunContext | null
  toolPolicy?: ToolPolicy
}

export function createToolPolicyExtension(
  options: CreateToolPolicyExtensionOptions,
): BundledLexoraExtension {
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

    const run = options.getRunContext()
    if (!run)
      return block('RUN_CONTEXT_UNAVAILABLE')
    const approval = await options.approvalService.request({
      arguments: event.input,
      kind: decision.kind,
      runId: run.runId,
      signal: run.signal,
      summary: decision.summary,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
    })
    return approval === 'approved' ? undefined : block('APPROVAL_DENIED')
  }
  catch (error) {
    return block(readStableErrorCode(error))
  }
}

function block(reason: string): ToolCallEventResult {
  return { block: true, reason, terminate: false }
}

function readStableErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error))
    return 'TOOL_POLICY_FAILED'
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string')
    return 'TOOL_POLICY_FAILED'
  if (new Set([
    'APPROVAL_CANCELLED',
    'INVALID_PATH',
    'PATH_NOT_FOUND',
    'PATH_OUTSIDE_GRANTED_DIRECTORY',
    'VALIDATION_FAILED',
  ]).has(code)) {
    return code
  }
  return 'TOOL_POLICY_FAILED'
}
