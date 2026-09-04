import type {
  ApprovalReviewKind,
  AutomationApprovalReviewInput,
  BrowserApprovalReviewInput,
  PathApprovalReviewInput,
  SystemActionApprovalReviewInput,
} from '../../../shared/approvalReviewPayload'
import type { AppendBuddyRunEventInput } from '../events/BuddyRunEvent'
import type { ToolCallBlockingError } from '../permissions/permissionContract'
import type {
  ApprovalRecord,
  ApprovalRepository,
} from '../storage/approvalRepository'
import { randomUUID } from 'node:crypto'
import { createApprovalReviewPayload } from '../../../shared/approvalReviewPayload'

export const APPROVAL_WAIT_TIMEOUT_MS = 30 * 60 * 1_000

export type ApprovalDecision = 'approved' | 'denied'
export type ApprovalResolutionDecision = ApprovalDecision | 'approved_for_turn'
export type ApprovalRequestResult
  = { approvalId: string, decision: 'approved_once' | 'approved_for_turn' | 'denied' }
    | { decision: 'approved_by_turn', sourceApprovalId: string }

export interface ApprovalRequest {
  allowForTurn: boolean
  arguments: unknown
  automation?: AutomationApprovalReviewInput
  browser?: BrowserApprovalReviewInput
  kind: ApprovalReviewKind
  paths?: PathApprovalReviewInput
  runId: string
  signal: AbortSignal
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
  allowForTurn: boolean
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
  readonly #approvedTurns = new Map<string, {
    sourceApprovalId: string
  }>()

  readonly #resolving = new Map<string, Promise<unknown>>()
  readonly #waiters = new Map<string, ApprovalWaiter>()

  constructor(options: ApprovalServiceOptions) {
    this.#approvalTimeoutMs = options.approvalTimeoutMs ?? APPROVAL_WAIT_TIMEOUT_MS
    this.#eventLog = options.eventLog
    this.#onExpired = options.onExpired ?? (() => {})
    this.#repository = options.repository
  }

  async request(input: ApprovalRequest): Promise<ApprovalRequestResult> {
    if (input.signal.aborted)
      throw new ApprovalCancelledError()
    const turnAuthorization = this.#approvedTurns.get(input.runId)
    if (input.allowForTurn && turnAuthorization) {
      await this.#eventLog.append({
        runId: input.runId,
        type: 'approval.turn_reused',
        payload: {
          sourceApprovalId: turnAuthorization.sourceApprovalId,
          toolCallId: input.toolCallId,
          toolName: input.toolName,
        },
      })
      return {
        decision: 'approved_by_turn',
        sourceApprovalId: turnAuthorization.sourceApprovalId,
      }
    }

    const approval: ApprovalRecord = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      kind: input.kind,
      payload: createApprovalReviewPayload({
        allowForTurn: input.allowForTurn,
        arguments: input.arguments,
        automation: input.automation,
        browser: input.browser,
        kind: input.kind,
        paths: input.paths,
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
        allowForTurn: input.allowForTurn,
        cleanup: () => {
          if (timer)
            clearTimeout(timer)
          input.signal.removeEventListener('abort', abort)
        },
        reject,
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

  clearTurnAuthorization(runId: string): void {
    this.#approvedTurns.delete(runId)
  }

  async #resolvePending(input: ApprovalResolution): Promise<ApprovalRecord> {
    const pending = this.#requireApproval(input.id)
    if (pending.status !== 'pending')
      throw new ApprovalResolutionError()
    const waiter = this.#waiters.get(input.id)
    if (input.decision === 'approved_for_turn' && !waiter?.allowForTurn)
      throw new ApprovalResolutionError()
    const approvedTurnSignal = input.decision === 'approved_for_turn' && waiter
      ? waiter.signal
      : null
    const decision: ApprovalDecision = input.decision === 'approved_for_turn'
      ? 'approved'
      : input.decision
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
    if (approvedTurnSignal && !approvedTurnSignal.aborted) {
      this.#approvedTurns.set(pending.runId, {
        sourceApprovalId: pending.id,
      })
      approvedTurnSignal.addEventListener('abort', () => {
        if (this.#approvedTurns.get(pending.runId)?.sourceApprovalId === pending.id)
          this.#approvedTurns.delete(pending.runId)
      }, { once: true })
    }
    waiter?.resolve({
      approvalId: pending.id,
      decision: input.decision === 'approved_for_turn'
        ? 'approved_for_turn'
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
