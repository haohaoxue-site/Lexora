import type { SystemActionApprovalReviewInput } from '../../../shared/approvalReviewPayload'

export const SYSTEM_ACTION_KINDS = [
  'kill-process',
  'restart-service',
  'start-service',
  'stop-service',
  'terminate-process',
] as const

export type SystemActionKind = typeof SYSTEM_ACTION_KINDS[number]
export type SystemInterruption = 'application' | 'network' | 'none' | 'service'

interface SystemTargetBase {
  allowedActions: readonly SystemActionKind[]
  displayName: string
  interruption: SystemInterruption
}

export interface ProcessSystemTarget extends SystemTargetBase {
  executable: string | null
  kind: 'process'
  pid: number
  startedAt: string
  startTicks: string
}

export interface ServiceSystemTarget extends SystemTargetBase {
  activeState: string
  displayUnit: string
  kind: 'service'
  scope: 'user'
  unit: string
}

export type SystemTarget = ProcessSystemTarget | ServiceSystemTarget

export type ProcessSystemTargetSelector
  = | { kind: 'process', name: string }
    | { kind: 'process', pid: number }

export interface ServiceSystemTargetSelector {
  kind: 'service'
  scope: 'user'
  unit: string
}

export type SystemTargetSelector = ProcessSystemTargetSelector | ServiceSystemTargetSelector

interface SystemActionRequestBase {
  reason: string
}

export interface ProcessSystemActionRequest extends SystemActionRequestBase {
  action: 'kill-process' | 'terminate-process'
  target: ProcessSystemTargetSelector
}

export interface ServiceSystemActionRequest extends SystemActionRequestBase {
  action: 'restart-service' | 'start-service' | 'stop-service'
  target: ServiceSystemTargetSelector
}

export type SystemActionRequest = ProcessSystemActionRequest | ServiceSystemActionRequest

export interface SystemHostPort {
  execute: (
    target: SystemTarget,
    action: SystemActionKind,
    signal: AbortSignal,
  ) => Promise<void>
  readTarget: (
    target: SystemTarget,
    signal: AbortSignal,
  ) => Promise<SystemTarget | null>
  resolveTargets: (
    selector: SystemTargetSelector,
    signal: AbortSignal,
  ) => Promise<readonly SystemTarget[]>
}

export interface PreparedSystemAction {
  review: SystemActionApprovalReviewInput
  summary: string
}

interface PreparedSystemActionEntry {
  expiresAt: number
  request: SystemActionRequest
  target: SystemTarget
}

export interface SystemActionPreparationRegistryOptions {
  maxEntries?: number
  now?: () => number
  ttlMs?: number
}

export class SystemActionPreparationRegistry {
  readonly #entries = new Map<string, PreparedSystemActionEntry>()
  readonly #maxEntries: number
  readonly #now: () => number
  readonly #ttlMs: number

  constructor(options: SystemActionPreparationRegistryOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 512
    this.#now = options.now ?? Date.now
    this.#ttlMs = options.ttlMs ?? 5 * 60 * 1_000
  }

  prepare(
    toolCallId: string,
    request: SystemActionRequest,
    target: SystemTarget,
  ): PreparedSystemAction {
    this.#prune()
    const existing = this.#entries.get(toolCallId)
    if (existing) {
      if (!sameRequest(existing.request, request) || !sameTargetIdentity(existing.target, target))
        throw new SystemCapabilityError('SYSTEM_ACTION_CHANGED')
      return createPreparedSystemAction(existing)
    }
    const entry: PreparedSystemActionEntry = {
      expiresAt: this.#now() + this.#ttlMs,
      request: cloneRequest(request),
      target: cloneTarget(target),
    }
    this.#entries.set(toolCallId, entry)
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (typeof oldest !== 'string')
        break
      this.#entries.delete(oldest)
    }
    return createPreparedSystemAction(entry)
  }

  take(toolCallId: string, request: SystemActionRequest): SystemTarget {
    const entry = this.#entries.get(toolCallId)
    if (!entry)
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_PREPARED')
    this.#entries.delete(toolCallId)
    if (entry.expiresAt <= this.#now())
      throw new SystemCapabilityError('SYSTEM_ACTION_EXPIRED')
    if (!sameRequest(entry.request, request))
      throw new SystemCapabilityError('SYSTEM_ACTION_CHANGED')
    return cloneTarget(entry.target)
  }

  #prune(): void {
    const now = this.#now()
    for (const [toolCallId, entry] of this.#entries) {
      if (entry.expiresAt <= now)
        this.#entries.delete(toolCallId)
    }
  }
}

export interface SystemCapabilityServiceOptions {
  actions?: SystemActionPreparationRegistry
  host: SystemHostPort
}

export class SystemCapabilityService {
  readonly #actions: SystemActionPreparationRegistry
  readonly #host: SystemHostPort

  constructor(options: SystemCapabilityServiceOptions) {
    this.#actions = options.actions ?? new SystemActionPreparationRegistry()
    this.#host = options.host
  }

  async prepareAction(
    toolCallId: string,
    input: SystemActionRequest,
    signal: AbortSignal,
  ): Promise<PreparedSystemAction> {
    signal.throwIfAborted()
    validateActionRequest(input)
    const targets = await this.#host.resolveTargets(input.target, signal)
    if (targets.length === 0)
      throw new SystemCapabilityError('SYSTEM_TARGET_NOT_FOUND')
    if (targets.length > 1)
      throw new SystemCapabilityError('SYSTEM_TARGET_AMBIGUOUS')
    const target = targets[0]!
    if (!target.allowedActions.includes(input.action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    return this.#actions.prepare(toolCallId, input, target)
  }

  async act(
    toolCallId: string,
    input: SystemActionRequest,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    validateActionRequest(input)
    const approvedTarget = this.#actions.take(toolCallId, input)
    const current = await this.#host.readTarget(approvedTarget, signal)
    if (!current || !sameTargetIdentity(approvedTarget, current))
      throw new SystemCapabilityError('SYSTEM_TARGET_CHANGED')
    if (!current.allowedActions.includes(input.action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    await this.#host.execute(current, input.action, signal)
    const postAction = await this.#host.readTarget(current, signal)
    const outcome = evaluatePostcondition(input.action, current, postAction)
    return {
      action: input.action,
      message: outcome.message,
      observedAt: new Date().toISOString(),
      status: outcome.status,
      target: targetReview(current),
      verified: outcome.verified,
    }
  }
}

export type SystemCapabilityErrorCode
  = 'SYSTEM_ACTION_CHANGED'
    | 'SYSTEM_ACTION_EXPIRED'
    | 'SYSTEM_ACTION_INVALID'
    | 'SYSTEM_ACTION_NOT_ALLOWED'
    | 'SYSTEM_ACTION_NOT_PREPARED'
    | 'SYSTEM_TARGET_AMBIGUOUS'
    | 'SYSTEM_TARGET_CHANGED'
    | 'SYSTEM_TARGET_NOT_FOUND'

export class SystemCapabilityError extends Error {
  readonly code: SystemCapabilityErrorCode

  constructor(code: SystemCapabilityErrorCode) {
    super('Lexora Buddy system capability could not complete the request')
    this.name = 'SystemCapabilityError'
    this.code = code
  }
}

function validateActionRequest(input: SystemActionRequest): void {
  const reason = input.reason.trim()
  if (!reason || reason.length > 512)
    throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  if (input.target.kind === 'process') {
    if (input.action !== 'terminate-process' && input.action !== 'kill-process')
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    if ('pid' in input.target) {
      if (!Number.isSafeInteger(input.target.pid) || input.target.pid <= 1)
        throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
      return
    }
    if (!input.target.name.trim() || input.target.name.length > 256)
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    return
  }
  if (input.action !== 'start-service'
    && input.action !== 'stop-service'
    && input.action !== 'restart-service') {
    throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  }
  if (input.target.scope !== 'user'
    || !input.target.unit.trim()
    || !input.target.unit.endsWith('.service')
    || input.target.unit.length > 256) {
    throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  }
}

function sameTargetIdentity(expected: SystemTarget, current: SystemTarget): boolean {
  if (expected.kind !== current.kind)
    return false
  if (expected.kind === 'process' && current.kind === 'process') {
    return expected.pid === current.pid
      && expected.startTicks === current.startTicks
      && expected.executable === current.executable
  }
  return expected.kind === 'service'
    && current.kind === 'service'
    && expected.scope === current.scope
    && expected.unit === current.unit
}

function sameRequest(expected: SystemActionRequest, current: SystemActionRequest): boolean {
  if (expected.action !== current.action || expected.reason !== current.reason)
    return false
  if (expected.target.kind !== current.target.kind)
    return false
  if (expected.target.kind === 'service' && current.target.kind === 'service') {
    return expected.target.scope === current.target.scope
      && expected.target.unit === current.target.unit
  }
  if (expected.target.kind !== 'process' || current.target.kind !== 'process')
    return false
  if ('pid' in expected.target || 'pid' in current.target) {
    return 'pid' in expected.target
      && 'pid' in current.target
      && expected.target.pid === current.target.pid
  }
  return expected.target.name === current.target.name
}

function evaluatePostcondition(
  action: SystemActionKind,
  target: SystemTarget,
  postAction: SystemTarget | null,
): { message: string, status: 'completed' | 'failed' | 'needs-escalation', verified: boolean } {
  if (target.kind === 'process') {
    if (!postAction || !sameTargetIdentity(target, postAction)) {
      return {
        message: 'The approved process identity is no longer running',
        status: 'completed',
        verified: true,
      }
    }
    if (action === 'terminate-process') {
      return {
        message: 'The process is still running after the graceful termination request',
        status: 'needs-escalation',
        verified: false,
      }
    }
    return {
      message: 'The process is still running after the force termination request',
      status: 'failed',
      verified: false,
    }
  }
  if (!postAction || postAction.kind !== 'service') {
    return {
      message: 'The service state could not be verified after the action',
      status: 'failed',
      verified: false,
    }
  }
  const expectedActive = action === 'start-service' || action === 'restart-service'
  const verified = expectedActive
    ? postAction.activeState === 'active'
    : postAction.activeState === 'inactive' || postAction.activeState === 'failed'
  return {
    message: verified
      ? `The service state was verified as ${postAction.activeState}`
      : `The service state is ${postAction.activeState}`,
    status: verified ? 'completed' : 'failed',
    verified,
  }
}

function createPreparedSystemAction(entry: PreparedSystemActionEntry): PreparedSystemAction {
  return {
    review: {
      action: entry.request.action,
      effect: describeEffect(entry.request.action),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      interruption: entry.target.interruption,
      reason: entry.request.reason.trim(),
      target: targetReview(entry.target),
    },
    summary: describeSummary(entry.request.action, entry.target),
  }
}

function targetReview(target: SystemTarget): SystemActionApprovalReviewInput['target'] {
  return target.kind === 'process'
    ? {
        displayName: target.displayName,
        pid: target.pid,
        startedAt: target.startedAt,
      }
    : {
        displayName: target.displayName,
        unit: target.displayUnit,
      }
}

function describeEffect(action: SystemActionKind): string {
  switch (action) {
    case 'terminate-process':
      return 'Ask the process to exit gracefully'
    case 'kill-process':
      return 'Force the process to stop immediately'
    case 'restart-service':
      return 'Stop and start the user service'
    case 'start-service':
      return 'Start the user service'
    case 'stop-service':
      return 'Stop the user service'
  }
}

function describeSummary(action: SystemActionKind, target: SystemTarget): string {
  return `${describeEffect(action)}: ${target.displayName}`
}

function cloneRequest(request: SystemActionRequest): SystemActionRequest {
  switch (request.action) {
    case 'kill-process':
    case 'terminate-process':
      return { ...request, target: { ...request.target } }
    case 'restart-service':
    case 'start-service':
    case 'stop-service':
      return { ...request, target: { ...request.target } }
  }
}

function cloneTarget(target: SystemTarget): SystemTarget {
  return { ...target, allowedActions: [...target.allowedActions] }
}
