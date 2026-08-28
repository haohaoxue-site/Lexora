import type { RunRecord } from '../storage/runRecord'
import type { BuddyTurnHandle } from './BuddyAgentRun'
import type { BuddySessionIdentity } from './BuddySessionBlueprint'
import { BuddyAgentRunError } from '../runs/runError'

export interface ActiveRunSession {
  abort: () => Promise<void>
  abortCompaction: () => void
}

export interface ActiveRunContext {
  activateSession: (session: ActiveRunSession) => void
  getCancellationCode: () => string | null
  identity: BuddySessionIdentity
  requestCancellation: (errorCode: string) => void
  runId: string
  signal: AbortSignal
}

interface ActiveRunState {
  cancellationCode: string | null
  controller: AbortController
  identity: BuddySessionIdentity
  runId: string
  session: ActiveRunSession | null
}

interface ActiveRunExecution {
  completion: Promise<RunRecord>
  state: ActiveRunState
}

interface StartActiveRunInput {
  execute: (context: ActiveRunContext) => Promise<RunRecord>
  identity: BuddySessionIdentity
  runId: string
}

export class ActiveRunRegistry {
  readonly #executions = new Map<string, ActiveRunExecution>()

  start(input: StartActiveRunInput): BuddyTurnHandle {
    if (this.#executions.has(input.runId))
      throw new BuddyAgentRunError('VALIDATION_FAILED')

    const state: ActiveRunState = {
      cancellationCode: null,
      controller: new AbortController(),
      identity: input.identity,
      runId: input.runId,
      session: null,
    }
    const context: ActiveRunContext = {
      activateSession: session => this.#activateSession(state, session),
      getCancellationCode: () => state.cancellationCode,
      identity: state.identity,
      requestCancellation: errorCode => this.#requestCancellation(state, errorCode),
      runId: state.runId,
      signal: state.controller.signal,
    }
    const completion = Promise.resolve()
      .then(() => input.execute(context))
      .finally(() => {
        const execution = this.#executions.get(state.runId)
        if (execution?.state === state)
          this.#executions.delete(state.runId)
      })
    this.#executions.set(state.runId, { completion, state })
    return { completion, runId: state.runId }
  }

  async cancel(runId: string, errorCode = 'RUN_CANCELLED'): Promise<boolean> {
    const execution = this.#executions.get(runId)
    if (!execution)
      return false
    this.#requestCancellation(execution.state, errorCode)
    await this.#abortSession(execution.state.session)
    await execution.completion.catch(() => {})
    return true
  }

  cancelAndWaitForConversation(conversationId: string): Promise<number> {
    return this.#cancelAndWait(
      execution => execution.state.identity.conversationId === conversationId,
    )
  }

  cancelAndWaitForRoot(canonicalRoot: string): Promise<number> {
    return this.#cancelAndWait(
      execution => execution.state.identity.canonicalRoot === canonicalRoot,
    )
  }

  async dispose(): Promise<void> {
    const executions = [...this.#executions.values()]
    for (const execution of executions)
      this.#requestCancellation(execution.state, 'RUN_CANCELLED')
    await Promise.allSettled(
      executions.map(execution => this.#abortSession(execution.state.session)),
    )
    await Promise.allSettled(executions.map(execution => execution.completion))
    this.#executions.clear()
  }

  async #cancelAndWait(
    predicate: (execution: ActiveRunExecution) => boolean,
  ): Promise<number> {
    const executions = [...this.#executions.values()].filter(predicate)
    for (const execution of executions)
      this.#requestCancellation(execution.state, 'RUN_CANCELLED')
    await Promise.allSettled(executions.map(async (execution) => {
      await this.#abortSession(execution.state.session)
      await execution.completion
    }))
    return executions.length
  }

  #activateSession(state: ActiveRunState, session: ActiveRunSession): void {
    state.session = session
    if (state.controller.signal.aborted)
      void this.#abortSession(session)
  }

  async #abortSession(session: ActiveRunSession | null): Promise<void> {
    if (!session)
      return
    try {
      session.abortCompaction()
    }
    catch {}
    try {
      await session.abort()
    }
    catch {}
  }

  #requestCancellation(state: ActiveRunState, errorCode: string): void {
    if (state.controller.signal.aborted)
      return
    state.cancellationCode = errorCode
    state.controller.abort()
  }
}
