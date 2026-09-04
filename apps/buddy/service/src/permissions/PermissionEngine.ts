import type { ShellCommandPolicy } from '../approvals/toolPolicyContract'
import type { PathClassification } from './classifyPath'
import type { PermissionOutcome } from './decisionTable'
import type {
  AccessKind,
  GrantProposal,
  PermissionDecision,
  PermissionPath,
  PermissionRequest,
} from './permissionContract'
import type { SensitivePathMatcher } from './sensitivePaths'
import process from 'node:process'
import { ShellPolicy } from '../approvals/ShellPolicy'
import { classifyPath, PathClassificationError, toGrantRoot } from './classifyPath'
import { lookupPermissionOutcome } from './decisionTable'
import { allow, ask, deny } from './permissionContract'
import { createSensitivePathMatcher } from './sensitivePaths'

type ShellToolName = 'bash' | 'powershell'

const OUTCOME_SEVERITY: Record<PermissionOutcome, number> = {
  allow: 0,
  delegate: 1,
  delegate_allowlist: 2,
  ask: 3,
  ask_grant: 4,
  deny_profile: 5,
  deny_sensitive: 6,
}

const BUILTIN_TOOL_ACCESS: Record<string, AccessKind> = {
  bash: 'execute',
  edit: 'write',
  find: 'read',
  grep: 'read',
  ls: 'read',
  powershell: 'execute',
  read: 'read',
  write: 'write',
}

export interface PermissionEngineOptions {
  platform?: NodeJS.Platform
  sensitive?: SensitivePathMatcher
  shellPolicies?: Partial<Record<ShellToolName, ShellCommandPolicy>>
}

export class PermissionEngine {
  readonly #sensitive: SensitivePathMatcher
  readonly #shellPolicies: Readonly<Record<ShellToolName, ShellCommandPolicy>>

  constructor(options: PermissionEngineOptions = {}) {
    const platform = options.platform ?? process.platform
    this.#sensitive = options.sensitive ?? createSensitivePathMatcher()
    this.#shellPolicies = {
      bash: options.shellPolicies?.bash ?? new ShellPolicy({ dialect: 'bash', platform }),
      powershell: options.shellPolicies?.powershell
        ?? new ShellPolicy({ dialect: 'powershell', platform }),
    }
  }

  async decide(request: PermissionRequest): Promise<PermissionDecision> {
    try {
      return await this.#decide(request)
    }
    catch (error) {
      if (error instanceof PathClassificationError)
        return deny(error.code, 'invalid')
      if (error instanceof PermissionValidationError)
        return deny('VALIDATION_FAILED', 'invalid')
      throw error
    }
  }

  async #decide(request: PermissionRequest): Promise<PermissionDecision> {
    const access = request.access ?? BUILTIN_TOOL_ACCESS[request.toolName] ?? null
    const paths = resolveRequestPaths(request, access)
    const classifications: PathClassification[] = []
    for (const path of paths) {
      classifications.push(await classifyPath({
        cwd: request.cwd,
        grants: request.grants,
        mode: path.mode,
        path: path.path,
        sensitive: this.#sensitive,
      }))
    }

    if (!access)
      return finalizeDecision(request, this.#unknownAccess(request, classifications))

    const worst = this.#worstOutcome(request, access, classifications)
    const decision = this.#toDecision(
      request,
      access,
      worst.outcome,
      worst.classification,
      classifications,
    )
    return finalizeDecision(
      request,
      applyApprovalPolicy(request, access, classifications, decision),
    )
  }

  #unknownAccess(
    request: PermissionRequest,
    classifications: readonly PathClassification[],
  ): PermissionDecision {
    if (classifications.some(entry => entry.zone === 'sensitive'))
      return deny('SENSITIVE_PATH', 'sensitive')
    return ask({
      allowForTurn: false,
      kind: request.approval?.kind ?? 'system',
      summary: request.approval?.summary ?? 'Use a tool with unknown local side effects',
    })
  }

  #worstOutcome(
    request: PermissionRequest,
    access: AccessKind,
    classifications: readonly PathClassification[],
  ): { classification: PathClassification | null, outcome: PermissionOutcome } {
    let worst: { classification: PathClassification | null, outcome: PermissionOutcome } = {
      classification: null,
      outcome: lookupPermissionOutcome({ access, profile: request.profile, zone: 'workspace' }),
    }
    for (const classification of classifications) {
      const outcome = lookupPermissionOutcome({
        access,
        profile: request.profile,
        zone: classification.zone,
      })
      if (OUTCOME_SEVERITY[outcome] >= OUTCOME_SEVERITY[worst.outcome])
        worst = { classification, outcome }
    }
    return worst
  }

  #toDecision(
    request: PermissionRequest,
    access: AccessKind,
    outcome: PermissionOutcome,
    classification: PathClassification | null,
    classifications: readonly PathClassification[],
  ): PermissionDecision {
    const forceAsk = Boolean(request.forceAsk)
      || (access === 'read' && classifications.some(entry => entry.zone === 'sensitive'))
      || this.#requiresForcedShellApproval(request, access)
    switch (outcome) {
      case 'deny_sensitive':
        return deny('SENSITIVE_PATH', 'sensitive')
      case 'deny_profile':
        return deny('READ_ONLY_PROFILE', 'profile')
      case 'delegate':
      case 'delegate_allowlist':
        return this.#decideShell(request, outcome)
      case 'allow':
        return forceAsk
          ? ask({
              allowForTurn: false,
              kind: request.approval?.kind ?? approvalKindFor(access),
              paths: toDecisionPaths(classifications),
              summary: request.approval?.summary ?? summaryFor(access),
            })
          : allow()
      case 'ask':
        return ask({
          allowForTurn: !forceAsk,
          kind: request.approval?.kind ?? approvalKindFor(access),
          paths: toDecisionPaths(classifications),
          summary: request.approval?.summary ?? summaryFor(access),
        })
      case 'ask_grant': {
        const grants = classifications
          .filter(entry => lookupPermissionOutcome({
            access,
            profile: request.profile,
            zone: entry.zone,
          }) === 'ask_grant')
          .map(entry => toGrantProposal(request, entry))
          .filter((grant, index, all) => (
            all.findIndex(candidate => candidate.root === grant.root) === index
          ))
        if (grants.length > 1)
          return deny('MULTIPLE_DIRECTORY_GRANTS_REQUIRED', 'invalid')
        return ask({
          allowForTurn: !forceAsk,
          ...(grants[0]
            ? { grant: grants[0] }
            : classification
              ? { grant: toGrantProposal(request, classification) }
              : {}),
          kind: request.approval?.kind ?? approvalKindFor(access),
          paths: toDecisionPaths(classifications),
          summary: request.approval?.summary ?? summaryFor(access),
        })
      }
    }
  }

  #decideShell(
    request: PermissionRequest,
    outcome: 'delegate' | 'delegate_allowlist',
  ): PermissionDecision {
    const policy = this.#shellPolicies[request.toolName as ShellToolName]
    if (!policy) {
      if (outcome === 'delegate_allowlist')
        return deny('READ_ONLY_PROFILE', 'profile')
      return request.profile === 'full_access' && !request.forceAsk
        ? allow()
        : ask({
            allowForTurn: !request.forceAsk,
            kind: request.approval?.kind ?? 'system',
            summary: request.approval?.summary ?? summaryFor('execute'),
          })
    }
    const decision = policy.decide(readStringProperty(request.arguments, 'command'))
    if (decision.type === 'allow')
      return request.forceAsk ? this.#forcedShellAsk(request) : allow()
    if (decision.type !== 'ask')
      return deny('VALIDATION_FAILED', 'invalid')
    if (decision.forceAsk)
      return this.#forcedShellAsk(request)
    if (outcome === 'delegate_allowlist')
      return deny('READ_ONLY_PROFILE', 'profile')
    if (request.profile === 'full_access' && !request.forceAsk)
      return allow()
    return ask({
      allowForTurn: !request.forceAsk,
      kind: 'shell',
      summary: request.approval?.summary ?? 'Run a host shell command',
    })
  }

  #forcedShellAsk(request: PermissionRequest): PermissionDecision {
    return ask({
      allowForTurn: false,
      kind: 'shell',
      summary: request.approval?.summary ?? 'Run a host shell command',
    })
  }

  #requiresForcedShellApproval(
    request: PermissionRequest,
    access: AccessKind,
  ): boolean {
    if (access !== 'execute')
      return false
    const policy = this.#shellPolicies[request.toolName as ShellToolName]
    if (!policy)
      return false
    const decision = policy.decide(readStringProperty(request.arguments, 'command'))
    return decision.type === 'ask' && decision.forceAsk === true
  }
}

function applyApprovalPolicy(
  request: PermissionRequest,
  access: AccessKind,
  classifications: readonly PathClassification[],
  decision: PermissionDecision,
): PermissionDecision {
  if (
    request.approvalPolicy !== 'manual'
    || decision.type !== 'allow'
    || !requiresManualApproval(access)
  ) {
    return decision
  }
  return ask({
    kind: request.approval?.kind ?? approvalKindFor(access),
    paths: toDecisionPaths(classifications),
    summary: request.approval?.summary ?? manualApprovalSummaryFor(access),
  })
}

function requiresManualApproval(access: AccessKind): boolean {
  return access === 'delete'
    || access === 'execute'
    || access === 'interaction'
    || access === 'network'
    || access === 'write'
}

function manualApprovalSummaryFor(access: AccessKind): string {
  switch (access) {
    case 'delete':
      return 'Delete local content'
    case 'execute':
      return 'Run a host shell command'
    case 'interaction':
      return 'Interact with application content'
    case 'network':
      return 'Access an external network resource'
    case 'write':
      return 'Write local content'
    default:
      return 'Use a tool with local side effects'
  }
}

function toGrantProposal(
  request: PermissionRequest,
  classification: PathClassification,
): GrantProposal {
  return { owner: request.owner, root: toGrantRoot(classification) }
}

function resolveRequestPaths(
  request: PermissionRequest,
  access: AccessKind | null,
): readonly PermissionPath[] {
  if (request.paths?.length)
    return request.paths

  switch (request.toolName) {
    case 'read':
    case 'edit':
      return [{ mode: 'existing', path: readStringProperty(request.arguments, 'path') }]
    case 'write':
      return [{ mode: 'create', path: readStringProperty(request.arguments, 'path') }]
    case 'grep':
    case 'find':
    case 'ls':
      return [{
        mode: 'existing',
        path: readOptionalStringProperty(request.arguments, 'path') ?? request.cwd,
      }]
    default:
      break
  }

  if (access === 'delete' || access === 'write')
    throw new PermissionValidationError()
  return []
}

function approvalKindFor(access: AccessKind) {
  switch (access) {
    case 'delete':
      return 'delete' as const
    case 'execute':
      return 'shell' as const
    case 'network':
      return 'network' as const
    case 'read':
      return 'read' as const
    case 'render':
      return 'render' as const
    case 'write':
      return 'write' as const
    default:
      return 'system' as const
  }
}

function finalizeDecision(
  request: PermissionRequest,
  decision: PermissionDecision,
): PermissionDecision {
  return decision.type === 'ask' && !request.approvalAvailable
    ? deny('APPROVAL_UNAVAILABLE_IN_BACKGROUND', 'profile')
    : decision
}

function toDecisionPaths(
  classifications: readonly PathClassification[],
): readonly { path: string, zone: PathClassification['zone'] }[] | undefined {
  const paths = classifications.map(classification => ({
    path: classification.requestedPath,
    zone: classification.zone,
  }))
  return paths.length > 0 ? paths : undefined
}

function summaryFor(access: AccessKind): string {
  switch (access) {
    case 'delete':
      return 'Delete content outside the workspace'
    case 'execute':
      return 'Run a host shell command'
    case 'interaction':
      return 'Interact with application content'
    case 'network':
      return 'Access an external network resource'
    case 'read':
      return 'Read a sensitive location'
    case 'render':
      return 'Open local content in the browser'
    case 'write':
      return 'Write outside the workspace'
    default:
      return 'Use a tool with local side effects'
  }
}

class PermissionValidationError extends Error {
  constructor() {
    super('Lexora Buddy tool input is invalid')
    this.name = 'PermissionValidationError'
  }
}

function readStringProperty(value: unknown, key: string): string {
  const property = readOptionalStringProperty(value, key)
  if (property === undefined)
    throw new PermissionValidationError()
  return property
}

function readOptionalStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PermissionValidationError()
  const property = (value as Record<string, unknown>)[key]
  if (property === undefined)
    return undefined
  if (typeof property !== 'string' || !property.trim())
    throw new PermissionValidationError()
  return property
}
