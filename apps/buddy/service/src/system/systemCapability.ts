import type { SystemActionApprovalReviewInput } from '../../../shared/approvalReviewPayload'
import { randomUUID } from 'node:crypto'

export const SYSTEM_ACTION_KINDS = [
  'kill-process',
  'restart-service',
  'start-service',
  'stop-service',
  'terminate-process',
] as const

export type SystemActionKind = typeof SYSTEM_ACTION_KINDS[number]
export type SystemInspectionSection = 'applications' | 'listeners' | 'processes' | 'services'
export type SystemInterruption = 'application' | 'network' | 'none' | 'service'

export interface SystemInspectionRequest {
  detail?: 'diagnostic' | 'summary'
  include?: readonly SystemInspectionSection[]
  subject: string
}

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
  scope: 'system' | 'user'
  unit: string
}

export type SystemTarget = ProcessSystemTarget | ServiceSystemTarget

export interface HostProcessObservation {
  commandName: string
  commandSummary: string | null
  memoryRssBytes: number | null
  parentPid: number | null
  role: 'application' | 'launcher' | 'sidecar' | 'unknown'
  state: 'running' | 'sleeping' | 'stopped' | 'zombie' | 'unknown'
  target: ProcessSystemTarget
}

export interface HostServiceObservation {
  activeState: string
  description: string
  mainPid: number | null
  scope: 'system' | 'user'
  subState: string
  target?: ServiceSystemTarget
  unit: string
}

export interface HostListenerObservation {
  localAddress: string
  pid: number | null
  processName: string | null
  protocol: 'tcp' | 'udp'
  target?: ProcessSystemTarget
}

export interface HostApplicationObservation {
  displayName: string
  processIds: readonly number[]
  status: 'running' | 'stopped' | 'unknown'
  target?: ProcessSystemTarget | ServiceSystemTarget
}

export interface SystemProbeDiagnostic {
  code: string
  message: string
  probe: SystemInspectionSection
}

export interface SystemHostInspection {
  applications: readonly HostApplicationObservation[]
  diagnostics: readonly SystemProbeDiagnostic[]
  listeners: readonly HostListenerObservation[]
  observedAt: string
  processes: readonly HostProcessObservation[]
  services: readonly HostServiceObservation[]
}

export interface SystemHostPort {
  execute: (
    target: SystemTarget,
    action: SystemActionKind,
    signal: AbortSignal,
  ) => Promise<void>
  inspect: (
    input: SystemInspectionRequest,
    signal: AbortSignal,
  ) => Promise<SystemHostInspection>
  readTarget: (
    target: SystemTarget,
    signal: AbortSignal,
  ) => Promise<SystemTarget | null>
}

export interface SystemActionRequest {
  action: SystemActionKind
  reason: string
  targetRef: string
}

export interface PreparedSystemAction {
  review: SystemActionApprovalReviewInput
  summary: string
  target: SystemTarget
}

interface SystemTargetEntry {
  expiresAt: number
  target: SystemTarget
}

export interface SystemTargetRegistryOptions {
  maxEntries?: number
  now?: () => number
  randomId?: () => string
  ttlMs?: number
}

export class SystemTargetRegistry {
  readonly #entries = new Map<string, SystemTargetEntry>()
  readonly #maxEntries: number
  readonly #now: () => number
  readonly #randomId: () => string
  readonly #ttlMs: number

  constructor(options: SystemTargetRegistryOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 512
    this.#now = options.now ?? Date.now
    this.#randomId = options.randomId ?? randomUUID
    this.#ttlMs = options.ttlMs ?? 5 * 60 * 1_000
  }

  issue(target: SystemTarget): { expiresAt: string, targetRef: string } {
    this.#prune()
    const targetRef = `system-target:${this.#randomId()}`
    const expiresAt = this.#now() + this.#ttlMs
    this.#entries.set(targetRef, { expiresAt, target: cloneTarget(target) })
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (typeof oldest !== 'string')
        break
      this.#entries.delete(oldest)
    }
    return { expiresAt: new Date(expiresAt).toISOString(), targetRef }
  }

  prepareAction(input: SystemActionRequest): PreparedSystemAction {
    const entry = this.#require(input.targetRef)
    if (!entry.target.allowedActions.includes(input.action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    const reason = input.reason.trim()
    if (!reason || reason.length > 512)
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    return {
      review: {
        action: input.action,
        effect: describeEffect(input.action),
        expiresAt: new Date(entry.expiresAt).toISOString(),
        interruption: entry.target.interruption,
        reason,
        target: targetReview(entry.target),
      },
      summary: describeSummary(input.action, entry.target),
      target: cloneTarget(entry.target),
    }
  }

  #require(targetRef: string): SystemTargetEntry {
    const entry = this.#entries.get(targetRef)
    if (!entry)
      throw new SystemCapabilityError('SYSTEM_TARGET_UNKNOWN')
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(targetRef)
      throw new SystemCapabilityError('SYSTEM_TARGET_EXPIRED')
    }
    return entry
  }

  #prune(): void {
    const now = this.#now()
    for (const [targetRef, entry] of this.#entries) {
      if (entry.expiresAt <= now)
        this.#entries.delete(targetRef)
    }
  }
}

export interface SystemCapabilityServiceOptions {
  host: SystemHostPort
  targets?: SystemTargetRegistry
}

export class SystemCapabilityService {
  readonly #host: SystemHostPort
  readonly #targets: SystemTargetRegistry

  constructor(options: SystemCapabilityServiceOptions) {
    this.#host = options.host
    this.#targets = options.targets ?? new SystemTargetRegistry()
  }

  prepareAction(input: SystemActionRequest): PreparedSystemAction {
    return this.#targets.prepareAction(input)
  }

  async inspect(
    input: SystemInspectionRequest,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    const snapshot = await this.#host.inspect(input, signal)
    return {
      diagnostics: [...snapshot.diagnostics],
      facts: {
        applications: snapshot.applications.map(application => ({
          displayName: application.displayName,
          processIds: [...application.processIds],
          status: application.status,
          ...this.#publicTarget(application.target),
        })),
        listeners: snapshot.listeners.map(listener => ({
          localAddress: listener.localAddress,
          pid: listener.pid,
          processName: listener.processName,
          protocol: listener.protocol,
          ...this.#publicTarget(listener.target),
        })),
        processes: snapshot.processes.map(process => ({
          commandName: process.commandName,
          commandSummary: process.commandSummary,
          memoryRssBytes: process.memoryRssBytes,
          parentPid: process.parentPid,
          pid: process.target.pid,
          role: process.role,
          startedAt: process.target.startedAt,
          state: process.state,
          ...this.#requiredPublicTarget(process.target),
        })),
        services: snapshot.services.map(service => ({
          activeState: service.activeState,
          description: service.description,
          mainPid: service.mainPid,
          scope: service.scope,
          subState: service.subState,
          unit: service.unit,
          ...this.#publicTarget(service.target),
        })),
      },
      observedAt: snapshot.observedAt,
      subject: input.subject,
    }
  }

  async act(input: SystemActionRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    const prepared = this.#targets.prepareAction(input)
    const current = await this.#host.readTarget(prepared.target, signal)
    if (!current || !sameTargetIdentity(prepared.target, current))
      throw new SystemCapabilityError('SYSTEM_TARGET_CHANGED')
    await this.#host.execute(current, input.action, signal)
    const postAction = await this.#host.readTarget(current, signal)
    const outcome = evaluatePostcondition(input.action, current, postAction)
    const nextTarget = postAction && sameTargetIdentity(current, postAction)
      ? this.#targets.issue(postAction)
      : null
    return {
      action: input.action,
      message: outcome.message,
      nextTargetRef: outcome.status === 'needs-escalation'
        ? nextTarget?.targetRef ?? null
        : null,
      observedAt: new Date().toISOString(),
      status: outcome.status,
      target: targetReview(current),
      verified: outcome.verified,
    }
  }

  #requiredPublicTarget(target: SystemTarget) {
    const allowedActions = [...target.allowedActions]
    return {
      allowedActions,
      ...(allowedActions.length > 0 ? this.#targets.issue(target) : {}),
    }
  }

  #publicTarget(target: SystemTarget | undefined): {
    allowedActions?: SystemActionKind[]
    expiresAt?: string
    targetRef?: string
  } {
    if (!target)
      return {}
    return this.#requiredPublicTarget(target)
  }
}

export type SystemCapabilityErrorCode
  = 'SYSTEM_ACTION_INVALID'
    | 'SYSTEM_ACTION_NOT_ALLOWED'
    | 'SYSTEM_TARGET_CHANGED'
    | 'SYSTEM_TARGET_EXPIRED'
    | 'SYSTEM_TARGET_UNKNOWN'

export class SystemCapabilityError extends Error {
  readonly code: SystemCapabilityErrorCode

  constructor(code: SystemCapabilityErrorCode) {
    super('Lexora Buddy system capability could not complete the request')
    this.name = 'SystemCapabilityError'
    this.code = code
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

function evaluatePostcondition(
  action: SystemActionKind,
  target: SystemTarget,
  postAction: SystemTarget | null,
): { message: string, status: 'completed' | 'failed' | 'needs-escalation', verified: boolean } {
  if (target.kind === 'process') {
    if (!postAction || !sameTargetIdentity(target, postAction)) {
      return {
        message: 'The inspected process identity is no longer running',
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

function cloneTarget(target: SystemTarget): SystemTarget {
  return { ...target, allowedActions: [...target.allowedActions] }
}
