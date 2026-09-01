import type { RunLifecycleService } from '../runs/RunLifecycleService'
import type { RunRecord } from '../storage/runRecord'
import type { ActiveRunContext } from './ActiveRunRegistry'
import type {
  BuddyTurnHandle,
  StartBuddyCompactionInput,
  StartBuddyTurnInput,
} from './BuddyAgentRun'
import type { BuddySessionRegistry } from './BuddySessionRegistry'
import type {
  BuddyAgentSessionLike,
  PiExecutionOutcome,
  PiTurnExecutor,
} from './PiTurnExecutor'
import { RunEventLogFatalError } from '../events/RunEventFailure'
import { BuddyAgentRunError, readStableRunErrorCode } from '../runs/runError'
import { ActiveRunRegistry } from './ActiveRunRegistry'
import { toBuddySessionIdentity } from './BuddySessionBlueprint'

export interface BuddyAgentRunnerOptions {
  executor: Pick<
    PiTurnExecutor,
    'executeCompaction' | 'executeTurn' | 'invalidateSessionContinuityAfterFailure'
  >
  lifecycle: Pick<RunLifecycleService, 'finalize' | 'find' | 'start'>
  sessions: BuddySessionRegistry<BuddyAgentSessionLike>
}

export class BuddyAgentRunner {
  readonly #activeRuns = new ActiveRunRegistry()
  readonly #executor: BuddyAgentRunnerOptions['executor']
  readonly #lifecycle: BuddyAgentRunnerOptions['lifecycle']
  readonly #sessions: BuddySessionRegistry<BuddyAgentSessionLike>
  #lastTimestamp = 0

  constructor(options: BuddyAgentRunnerOptions) {
    this.#executor = options.executor
    this.#lifecycle = options.lifecycle
    this.#sessions = options.sessions
  }

  startTurn(input: StartBuddyTurnInput): BuddyTurnHandle {
    if (!input.prompt.trim())
      throw new BuddyAgentRunError('VALIDATION_FAILED')

    const runId = input.runId
    const run = this.#lifecycle.find(runId)
    const session = input.session
    if (
      !run
      || run.status !== 'queued'
      || (run.purpose !== 'chat' && run.purpose !== 'automation')
      || run.conversationId !== session.conversationId
      || run.branchId !== session.branchId
      || run.executionProfile !== session.executionProfile
      || session.sessionMode !== (run.purpose === 'automation'
        ? 'automation_background'
        : 'interactive')
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }

    const identity = toBuddySessionIdentity(session)
    return this.#activeRuns.start({
      execute: execution => this.#sessions.withBranchRun(
        execution.identity,
        execution.runId,
        execution.signal,
        () => this.#executeTurn(input, execution),
      ).catch(error => this.#closeExecutionFromError(execution, error)),
      identity,
      runId,
    })
  }

  startCompaction(input: StartBuddyCompactionInput): BuddyTurnHandle {
    const run = this.#lifecycle.find(input.runId)
    const session = input.session
    if (
      !run
      || run.status !== 'queued'
      || run.conversationId !== session.conversationId
      || run.branchId !== session.branchId
      || run.executionProfile !== session.executionProfile
      || run.purpose !== 'conversation.compaction'
      || !run.piSessionFile
      || session.sessionMode !== 'interactive'
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }

    const identity = toBuddySessionIdentity(session)
    return this.#activeRuns.start({
      execute: execution => this.#sessions.withBranchRun(
        execution.identity,
        execution.runId,
        execution.signal,
        () => this.#executeCompaction(input, run, execution),
      ).catch(error => this.#closeExecutionFromError(execution, error)),
      identity,
      runId: run.id,
    })
  }

  async cancel(runId: string, errorCode = 'RUN_CANCELLED'): Promise<boolean> {
    return this.#activeRuns.cancel(runId, errorCode)
  }

  cancelAndWaitForConversation(conversationId: string): Promise<number> {
    return this.#activeRuns.cancelAndWaitForConversation(conversationId)
  }

  cancelAndWaitForRoot(canonicalRoot: string): Promise<number> {
    return this.#activeRuns.cancelAndWaitForRoot(canonicalRoot)
  }

  async dispose(): Promise<void> {
    await this.#activeRuns.dispose()
    await this.#sessions.dispose()
  }

  async #executeTurn(
    input: StartBuddyTurnInput,
    execution: ActiveRunContext,
  ): Promise<RunRecord> {
    const { identity, runId, signal } = execution
    signal.throwIfAborted()
    const run = await this.#lifecycle.start({
      expectedPurposes: ['automation', 'chat'],
      payload: createRunStartedPayload(input),
      runId,
      startedAt: this.#timestamp(),
    })
    const outcome = await this.#executor.executeTurn({
      identity,
      input,
      onSessionActivated: execution.activateSession,
      onSessionStartupTimeout: () => execution.requestCancellation('AUTOMATION_RUN_TIMEOUT'),
      run,
      signal,
      timestamp: () => this.#timestamp(),
    })
    return this.#closeExecutionOutcome(execution, outcome)
  }

  async #executeCompaction(
    input: StartBuddyCompactionInput,
    run: RunRecord,
    execution: ActiveRunContext,
  ): Promise<RunRecord> {
    execution.signal.throwIfAborted()
    const startedRun = await this.#lifecycle.start({
      expectedPurposes: ['conversation.compaction'],
      payload: createRunStartedPayload(input),
      runId: run.id,
      startedAt: this.#timestamp(),
    })
    const outcome = await this.#executor.executeCompaction({
      identity: execution.identity,
      input,
      onSessionActivated: execution.activateSession,
      run: startedRun,
      signal: execution.signal,
      timestamp: () => this.#timestamp(),
    })
    return this.#closeExecutionOutcome(execution, outcome)
  }

  async #closeExecutionFromError(
    execution: ActiveRunContext,
    error: unknown,
  ): Promise<RunRecord> {
    if (error instanceof RunEventLogFatalError) {
      const run = this.#lifecycle.find(execution.runId)
      if (!run)
        throw new BuddyAgentRunError('RUN_NOT_FOUND')
      return run
    }
    await this.#executor.invalidateSessionContinuityAfterFailure({
      error,
      identity: execution.identity,
      runId: execution.runId,
    })
    if (execution.signal.aborted || isAbortError(error)) {
      return this.#closeRun(
        execution.runId,
        'cancelled',
        execution.getCancellationCode() ?? 'RUN_CANCELLED',
      )
    }
    return this.#closeRun(
      execution.runId,
      'failed',
      readStableRunErrorCode(error),
    )
  }

  #closeExecutionOutcome(
    execution: ActiveRunContext,
    outcome: PiExecutionOutcome,
  ): Promise<RunRecord> {
    const { runId } = execution
    if (outcome.status === 'completed')
      return this.#closeRun(runId, 'completed', null)
    if (outcome.status === 'cancelled') {
      return this.#closeRun(
        runId,
        'cancelled',
        outcome.errorCode ?? execution.getCancellationCode() ?? 'RUN_CANCELLED',
      )
    }
    return this.#closeRun(
      runId,
      'failed',
      outcome.errorCode,
      outcome.errorMessage,
    )
  }

  async #closeRun(
    runId: string,
    status: 'cancelled' | 'completed' | 'failed',
    errorCode: string | null,
    errorMessage?: string,
  ): Promise<RunRecord> {
    return this.#lifecycle.finalize({
      completedAt: this.#timestamp(),
      errorCode,
      errorMessage,
      runId,
      status,
    })
  }

  #timestamp(): string {
    this.#lastTimestamp = Math.max(Date.now(), this.#lastTimestamp + 1)
    return new Date(this.#lastTimestamp).toISOString()
  }
}

function createRunStartedPayload(
  input: StartBuddyTurnInput | StartBuddyCompactionInput,
): Record<string, unknown> {
  const { session } = input
  if (!session.space)
    return {}

  return {
    spaceSnapshot: {
      additionalDirectoryBindings: session.space.additionalDirectoryBindings,
      canonicalRoot: session.canonicalRoot,
      grantRevision: session.grantRevision,
      memoryScope: session.space.memoryScope,
      primaryDirectoryBinding: session.space.primaryDirectoryBinding,
      spaceId: session.space.id,
      resourceRevision: session.resources.revision,
    },
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
