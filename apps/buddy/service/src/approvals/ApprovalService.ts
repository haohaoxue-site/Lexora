import type { AppendBuddyRunEventInput } from '../events/RunEventLog'
import type {
  ApprovalRecord,
  ApprovalRepository,
} from '../storage/approvalRepository'
import type { ToolApprovalKind } from './ToolPolicy'
import { randomUUID } from 'node:crypto'
import { createApprovalReviewPayload } from '../../../shared/approvalReviewPayload'

export type ApprovalDecision = 'approved' | 'denied'

export interface ApprovalRequest {
  arguments: unknown
  kind: ToolApprovalKind
  runId: string
  signal: AbortSignal
  summary: string
  toolCallId: string
  toolName: string
}

export interface ApprovalResolution {
  decision: ApprovalDecision
  id: string
}

export interface ApprovalServiceOptions {
  eventLog: { append: (input: AppendBuddyRunEventInput) => Promise<unknown> }
  repository: ApprovalRepository
}

interface ApprovalWaiter {
  cleanup: () => void
  reject: (error: Error) => void
  resolve: (decision: ApprovalDecision) => void
}

export class ApprovalService {
  readonly #eventLog: ApprovalServiceOptions['eventLog']
  readonly #repository: ApprovalRepository
  readonly #resolving = new Map<string, Promise<unknown>>()
  readonly #waiters = new Map<string, ApprovalWaiter>()

  constructor(options: ApprovalServiceOptions) {
    this.#eventLog = options.eventLog
    this.#repository = options.repository
  }

  async request(input: ApprovalRequest): Promise<ApprovalDecision> {
    if (input.signal.aborted)
      throw new ApprovalCancelledError()

    const approval: ApprovalRecord = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      kind: input.kind,
      payload: createApprovalReviewPayload({
        arguments: input.arguments,
        kind: input.kind,
        toolName: input.toolName,
      }),
      resolvedAt: null,
      runId: input.runId,
      status: 'pending',
      summary: input.summary,
      toolCallId: input.toolCallId,
    }
    const abort = () => void this.#cancel(approval).catch(() => {})
    const decision = new Promise<ApprovalDecision>((resolve, reject) => {
      this.#waiters.set(approval.id, {
        cleanup: () => input.signal.removeEventListener('abort', abort),
        reject,
        resolve,
      })
    })
    void decision.catch(() => {})
    input.signal.addEventListener('abort', abort, { once: true })
    try {
      await this.#appendRequested(approval)
      this.#requireApproval(approval.id)
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

  async #resolvePending(input: ApprovalResolution): Promise<ApprovalRecord> {
    const pending = this.#requireApproval(input.id)
    if (pending.status !== 'pending')
      throw new ApprovalResolutionError()
    const resolvedAt = new Date().toISOString()
    const waiter = this.#waiters.get(input.id)
    await this.#appendResolved({
      ...pending,
      resolvedAt,
      status: input.decision,
    })
    const approval = this.#requireApproval(input.id)
    if (approval.status !== input.decision)
      throw new ApprovalResolutionError()
    waiter?.resolve(input.decision)
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

  async #cancel(approval: ApprovalRecord): Promise<void> {
    const resolving = this.#resolving.get(approval.id)
    if (resolving) {
      await resolving.catch(() => {})
      return this.#cancel(approval)
    }
    const pending = this.#repository.findById(approval.id)
    if (!pending || pending.status !== 'pending')
      return
    await this.#trackResolution(approval.id, this.#cancelPending(pending))
  }

  async #cancelPending(approval: ApprovalRecord): Promise<void> {
    const resolvedAt = new Date().toISOString()
    const waiter = this.#waiters.get(approval.id)
    try {
      await this.#appendResolved({ ...approval, resolvedAt, status: 'cancelled' })
      waiter?.reject(new ApprovalCancelledError())
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

  #appendResolved(approval: ApprovalRecord): Promise<unknown> {
    return this.#eventLog.append({
      runId: approval.runId,
      type: 'approval.resolved',
      payload: {
        id: approval.id,
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

export class ApprovalCancelledError extends Error {
  readonly code = 'APPROVAL_CANCELLED'

  constructor() {
    super('Lexora Buddy approval was cancelled')
    this.name = 'ApprovalCancelledError'
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
