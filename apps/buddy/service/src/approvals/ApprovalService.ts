import type {
  ApprovalReuseScope,
  ApprovalReviewKind,
  AutomationApprovalReviewInput,
  BrowserApprovalReviewInput,
  PathApprovalReviewInput,
  ShellApprovalContext,
  SystemActionApprovalReviewInput,
} from '../../../shared/permissions/approvalReviewPayload'
import type { SandboxDirectoryRequest, SandboxNetworkTarget } from '../../../shared/permissions/shellSandbox'
import type { AppendBuddyRunEventInput } from '../events/BuddyRunEvent'
import type { ToolCallBlockingError } from '../permissions/permissionContract'
import type {
  ApprovalRecord,
  ApprovalRepository,
} from '../storage/approvalRepository'
import type { ApprovalAuthorizationKeys, ApprovalAuthorizationOverride } from './approvalAuthorization'
import { randomUUID } from 'node:crypto'
import { createApprovalReviewPayload } from '../../../shared/permissions/approvalReviewPayload'
import { approvalReuseScopes, createApprovalAuthorizationKeys } from './approvalAuthorization'

export const APPROVAL_WAIT_TIMEOUT_MS = 30 * 60 * 1_000

export type ApprovalDecision = 'approved' | 'denied'
export type ApprovalResolutionDecision = ApprovalDecision | `approved_for_${ApprovalReuseScope}`
export type ApprovalRequestResult
  = { approvalId: string, decision: 'approved_once' | `approved_for_${ApprovalReuseScope}` | 'denied' }
    | { decision: `approved_by_${ApprovalReuseScope}`, sourceApprovalId: string }

export interface ApprovalRequest {
  reuseScopes?: readonly ApprovalReuseScope[]
  arguments: unknown
  automation?: AutomationApprovalReviewInput
  browser?: BrowserApprovalReviewInput
  cwd?: string
  kind: ApprovalReviewKind
  network?: SandboxNetworkTarget
  sandboxDirectory?: SandboxDirectoryRequest
  paths?: PathApprovalReviewInput
  reuse?: ApprovalAuthorizationOverride
  shell?: ShellApprovalContext
  runId: string
  signal: AbortSignal
  runSignal?: AbortSignal
  summary: string
  systemAction?: SystemActionApprovalReviewInput
  toolCallId: string
  toolName: string
}

export interface ApprovalResolution {
  decision: ApprovalResolutionDecision
  id: string
}

export interface ApprovalServiceOptions {
  approvalTimeoutMs?: number
  eventLog: { append: (input: AppendBuddyRunEventInput) => Promise<unknown> }
  onExpired?: (runId: string) => Promise<void> | void
  repository: ApprovalRepository
}

interface ApprovalWaiter {
  authorizationSignal: AbortSignal
  authorizationKeys: ApprovalAuthorizationKeys
  reuseScopes: ReadonlySet<ApprovalReuseScope>
  cleanup: () => void
  reject: (error: Error) => void
  resolve: (decision: ApprovalRequestResult) => void
  signal: AbortSignal
}

export class ApprovalService {
  readonly #approvalTimeoutMs: number
  readonly #eventLog: ApprovalServiceOptions['eventLog']
  readonly #onExpired: NonNullable<ApprovalServiceOptions['onExpired']>
  readonly #repository: ApprovalRepository
  readonly #authorizations = new Map<ApprovalReuseScope, Map<string, Map<string, string>>>([
    ['operation', new Map()],
    ['source', new Map()],
    ['turn', new Map()],
  ])

  readonly #resolving = new Map<string, Promise<unknown>>()
  readonly #waiters = new Map<string, ApprovalWaiter>()
  readonly #queues = new Map<string, Promise<void>>()
  readonly #runLifetimes = new Map<string, () => void>()

  constructor(options: ApprovalServiceOptions) {
    this.#approvalTimeoutMs = options.approvalTimeoutMs ?? APPROVAL_WAIT_TIMEOUT_MS
    this.#eventLog = options.eventLog
    this.#onExpired = options.onExpired ?? (() => {})
    this.#repository = options.repository
  }

  async request(input: ApprovalRequest): Promise<ApprovalRequestResult> {
    const previous = this.#queues.get(input.runId) ?? Promise.resolve()
    let started = false
    const pending = previous.then(() => {
      started = true
      return this.#request(input)
    })
    const settled = pending.then(() => {}, () => {})
    this.#queues.set(input.runId, settled)
    void settled.then(() => {
      if (this.#queues.get(input.runId) === settled)
        this.#queues.delete(input.runId)
    })
    return waitForApproval(pending, input.signal, () => started)
  }

  async #request(input: ApprovalRequest): Promise<ApprovalRequestResult> {
    if (input.signal.aborted)
      throw new ApprovalCancelledError()
    const authorizationKeys = createApprovalAuthorizationKeys(input, input.reuse)
    const reuseScopes = approvalReuseScopes(authorizationKeys, input.reuseScopes)
    const reused = this.#findAuthorization(input.runId, reuseScopes, authorizationKeys)
    if (reused) {
      await this.#eventLog.append({
        runId: input.runId,
        type: 'approval.reused',
        payload: {
          scope: reused.scope,
          sourceApprovalId: reused.sourceApprovalId,
          toolCallId: input.toolCallId,
          toolName: input.toolName,
        },
      })
      return {
        decision: `approved_by_${reused.scope}`,
        sourceApprovalId: reused.sourceApprovalId,
      }
    }

    const approval: ApprovalRecord = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      kind: input.kind,
      payload: createApprovalReviewPayload({
        allowForTurn: reuseScopes.includes('turn'),
        arguments: input.arguments,
        automation: input.automation,
        browser: input.browser,
        kind: input.kind,
        network: input.network,
        sandboxDirectory: input.sandboxDirectory,
        paths: input.paths,
        reuseScopes,
        shell: input.shell,
        systemAction: input.systemAction,
        toolName: input.toolName,
      }),
      resolvedAt: null,
      runId: input.runId,
      status: 'pending',
      summary: input.summary,
      toolCallId: input.toolCallId,
    }
    const abort = () => void this.#cancel(approval).catch(() => {})
    const expire = () => void this.#cancel(approval, true).catch(() => {})
    let timer: ReturnType<typeof setTimeout> | null = null
    const decision = new Promise<ApprovalRequestResult>((resolve, reject) => {
      this.#waiters.set(approval.id, {
        authorizationSignal: input.runSignal ?? input.signal,
        authorizationKeys,
        cleanup: () => {
          if (timer)
            clearTimeout(timer)
          input.signal.removeEventListener('abort', abort)
        },
        reject,
        reuseScopes: new Set(reuseScopes),
        resolve,
        signal: input.signal,
      })
    })
    void decision.catch(() => {})
    input.signal.addEventListener('abort', abort, { once: true })
    try {
      await this.#appendRequested(approval)
      this.#requireApproval(approval.id)
      if (!input.signal.aborted) {
        timer = setTimeout(expire, this.#approvalTimeoutMs)
        timer.unref?.()
      }
    }
    catch (error) {
      const waiter = this.#waiters.get(approval.id)
      waiter?.reject(asError(error))
      waiter?.cleanup()
      this.#waiters.delete(approval.id)
      throw error
    }
    if (input.signal.aborted) {
      await this.#cancel(approval)
      return decision
    }
    return decision
  }

  async resolve(input: ApprovalResolution): Promise<ApprovalRecord> {
    if (this.#resolving.has(input.id))
      throw new ApprovalResolutionError()
    return this.#trackResolution(input.id, this.#resolvePending(input))
  }

  clearRunAuthorizations(runId: string): void {
    this.#runLifetimes.get(runId)?.()
    this.#runLifetimes.delete(runId)
    for (const authorizations of this.#authorizations.values())
      authorizations.delete(runId)
  }

  async #resolvePending(input: ApprovalResolution): Promise<ApprovalRecord> {
    const pending = this.#requireApproval(input.id)
    if (pending.status !== 'pending')
      throw new ApprovalResolutionError()
    const waiter = this.#waiters.get(input.id)
    const approvedScope = readApprovedScope(input.decision)
    if (approvedScope && !waiter?.reuseScopes.has(approvedScope))
      throw new ApprovalResolutionError()
    const decision: ApprovalDecision = input.decision === 'denied' ? 'denied' : 'approved'
    const resolvedAt = new Date().toISOString()
    await this.#appendResolved({
      ...pending,
      resolvedAt,
      status: decision,
      resolution: input.decision,
    })
    const approval = this.#requireApproval(input.id)
    if (approval.status !== decision)
      throw new ApprovalResolutionError()
    if (approvedScope && waiter && !waiter.signal.aborted && !waiter.authorizationSignal.aborted) {
      this.#storeAuthorization(
        approvedScope,
        pending.runId,
        approvedScope === 'turn' ? pending.runId : waiter.authorizationKeys[approvedScope]!,
        pending.id,
      )
      if (!this.#runLifetimes.has(pending.runId)) {
        const clear = () => this.clearRunAuthorizations(pending.runId)
        waiter.authorizationSignal.addEventListener('abort', clear, { once: true })
        this.#runLifetimes.set(pending.runId, () => waiter.authorizationSignal.removeEventListener('abort', clear))
      }
    }
    waiter?.resolve({
      approvalId: pending.id,
      decision: approvedScope
        ? `approved_for_${approvedScope}`
        : decision === 'approved'
          ? 'approved_once'
          : 'denied',
    })
    waiter?.cleanup()
    this.#waiters.delete(input.id)
    return approval
  }

  async cancelPendingApprovals(): Promise<number> {
    let cancelled = 0
    for (const approval of this.#repository.listPending()) {
      await this.#cancel(approval)
      cancelled += 1
    }
    return cancelled
  }

  async #cancel(approval: ApprovalRecord, expired = false): Promise<void> {
    const resolving = this.#resolving.get(approval.id)
    if (resolving) {
      await resolving.catch(() => {})
      return this.#cancel(approval, expired)
    }
    const pending = this.#repository.findById(approval.id)
    if (!pending || pending.status !== 'pending')
      return
    await this.#trackResolution(approval.id, this.#cancelPending(pending, expired))
    if (expired)
      await this.#onExpired(approval.runId)
  }

  async #cancelPending(approval: ApprovalRecord, expired: boolean): Promise<void> {
    const resolvedAt = new Date().toISOString()
    const waiter = this.#waiters.get(approval.id)
    try {
      await this.#appendResolved({
        ...approval,
        resolvedAt,
        status: 'cancelled',
        resolution: 'cancelled',
      })
      waiter?.reject(expired ? new ApprovalExpiredError() : new ApprovalCancelledError())
    }
    catch (error) {
      waiter?.reject(asError(error))
      throw error
    }
    finally {
      waiter?.cleanup()
      this.#waiters.delete(approval.id)
    }
  }

  #trackResolution<T>(id: string, operation: Promise<T>): Promise<T> {
    const tracked = operation.finally(() => {
      if (this.#resolving.get(id) === tracked)
        this.#resolving.delete(id)
    })
    this.#resolving.set(id, tracked)
    return tracked
  }

  #appendRequested(approval: ApprovalRecord): Promise<unknown> {
    return this.#eventLog.append({
      runId: approval.runId,
      type: 'approval.requested',
      payload: approval,
    })
  }

  #appendResolved(
    approval: ApprovalRecord & { resolution: ApprovalResolutionDecision | 'cancelled' },
  ): Promise<unknown> {
    return this.#eventLog.append({
      runId: approval.runId,
      type: 'approval.resolved',
      payload: {
        id: approval.id,
        resolution: approval.resolution,
        status: approval.status,
        resolvedAt: approval.resolvedAt,
      },
    })
  }

  #requireApproval(id: string): ApprovalRecord {
    const approval = this.#repository.findById(id)
    if (!approval)
      throw new ApprovalResolutionError()
    return approval
  }

  #findAuthorization(
    runId: string,
    scopes: readonly ApprovalReuseScope[],
    keys: ApprovalAuthorizationKeys,
  ): { scope: ApprovalReuseScope, sourceApprovalId: string } | null {
    for (const scope of scopes) {
      const key = scope === 'turn' ? runId : keys[scope]
      if (!key)
        continue
      const sourceApprovalId = this.#authorizations.get(scope)?.get(runId)?.get(key)
      if (sourceApprovalId)
        return { scope, sourceApprovalId }
    }
    return null
  }

  #storeAuthorization(
    scope: ApprovalReuseScope,
    runId: string,
    key: string,
    sourceApprovalId: string,
  ): void {
    const authorizations = this.#authorizations.get(scope)!
    const runAuthorizations = authorizations.get(runId) ?? new Map<string, string>()
    runAuthorizations.set(key, sourceApprovalId)
    authorizations.set(runId, runAuthorizations)
  }
}

function readApprovedScope(decision: ApprovalResolutionDecision): ApprovalReuseScope | null {
  if (!decision.startsWith('approved_for_'))
    return null
  const scope = decision.slice('approved_for_'.length)
  return scope === 'operation' || scope === 'source' || scope === 'turn' ? scope : null
}

function waitForApproval<T>(pending: Promise<T>, signal: AbortSignal, started: () => boolean): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new ApprovalCancelledError())
  return new Promise((resolve, reject) => {
    const abort = () => {
      if (!started())
        reject(new ApprovalCancelledError())
    }
    signal.addEventListener('abort', abort, { once: true })
    void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export class ApprovalCancelledError extends Error implements ToolCallBlockingError {
  readonly code = 'APPROVAL_CANCELLED'
  readonly toolCallBlockReason = this.code

  constructor() {
    super('Lexora Buddy approval was cancelled')
    this.name = 'ApprovalCancelledError'
  }
}

export class ApprovalExpiredError extends Error implements ToolCallBlockingError {
  readonly code = 'AUTOMATION_APPROVAL_EXPIRED'
  readonly toolCallBlockReason = this.code

  constructor() {
    super('Lexora Buddy approval expired')
    this.name = 'ApprovalExpiredError'
  }
}

export class ApprovalResolutionError extends Error {
  readonly code = 'APPROVAL_NOT_PENDING'

  constructor() {
    super('Lexora Buddy approval is not pending')
    this.name = 'ApprovalResolutionError'
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Lexora Buddy approval failed')
}
