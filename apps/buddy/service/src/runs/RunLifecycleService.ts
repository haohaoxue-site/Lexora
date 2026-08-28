import type { AppendBuddyRunEventInput } from '../events/BuddyRunEvent'
import type { RunEventMaintenance, RunEventWriter } from '../events/RunEventPorts'
import type { RunPurpose, RunRecord, RunStatus } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import { RunEventLogFatalError } from '../events/RunEventFailure'
import { BuddyAgentRunError, readStableRunErrorCode } from './runError'

type TerminalRunStatus = Extract<RunStatus, 'cancelled' | 'completed' | 'failed'>

export interface StartRunInput {
  expectedPurposes: readonly RunPurpose[]
  payload: Record<string, unknown>
  runId: string
  startedAt: string
}

export interface FinalizeRunInput {
  completedAt: string
  errorCode: string | null
  errorMessage?: string
  precedingEvents?: readonly AppendBuddyRunEventInput[]
  runId: string
  status: TerminalRunStatus
}

export interface RunLifecycleServiceOptions {
  eventLog: Pick<RunEventWriter, 'append' | 'appendBatch'>
    & Pick<RunEventMaintenance, 'compactTerminalRun'>
  repository: Pick<
    RunRepository,
    'findById' | 'markRunning' | 'reconcileTerminal'
  >
}

export class RunLifecycleService {
  readonly #eventLog: RunLifecycleServiceOptions['eventLog']
  readonly #repository: RunLifecycleServiceOptions['repository']

  constructor(options: RunLifecycleServiceOptions) {
    this.#eventLog = options.eventLog
    this.#repository = options.repository
  }

  find(runId: string): RunRecord | null {
    return this.#repository.findById(runId)
  }

  async start(input: StartRunInput): Promise<RunRecord> {
    const run = this.#requireRun(input.runId)
    if (
      run.status !== 'queued'
      || !input.expectedPurposes.includes(run.purpose)
      || !this.#repository.markRunning(run.id, input.startedAt)
    ) {
      throw new BuddyAgentRunError('RUN_STATE_MISMATCH')
    }
    await this.#eventLog.append({
      createdAt: input.startedAt,
      payload: input.payload,
      runId: run.id,
      type: 'run.started',
    })
    return this.#requireRun(run.id)
  }

  async failBeforeStart(runId: string, error: unknown): Promise<RunRecord | null> {
    const run = this.#repository.findById(runId)
    if (!run || run.status !== 'queued')
      return null
    return this.finalize({
      completedAt: new Date().toISOString(),
      errorCode: readStableRunErrorCode(error),
      runId,
      status: 'failed',
    })
  }

  async finalize(input: FinalizeRunInput): Promise<RunRecord> {
    const existing = this.#requireRun(input.runId)
    if (isTerminal(existing.status)) {
      if (existing.status === input.status)
        return existing
      throw new BuddyAgentRunError('RUN_STATE_MISMATCH')
    }

    let { errorCode, status } = input
    let terminalEventPersisted = true
    const terminalEvent: AppendBuddyRunEventInput = {
      createdAt: input.completedAt,
      payload: {
        ...(errorCode ? { errorCode } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      },
      runId: input.runId,
      type: `run.${status}`,
    }
    try {
      if (input.precedingEvents?.length) {
        await this.#eventLog.appendBatch([
          ...input.precedingEvents,
          terminalEvent,
        ])
      }
      else {
        await this.#eventLog.append(terminalEvent)
      }
    }
    catch (error) {
      if (error instanceof RunEventLogFatalError)
        throw error
      terminalEventPersisted = false
      status = 'failed'
      errorCode = 'EVENT_LOG_FAILED'
    }
    if (!this.#repository.reconcileTerminal(
      input.runId,
      status,
      input.completedAt,
      errorCode,
    )) {
      throw new BuddyAgentRunError('RUN_STATE_MISMATCH')
    }
    const run = this.#requireRun(input.runId)
    if (terminalEventPersisted) {
      try {
        await this.#eventLog.compactTerminalRun(input.runId)
      }
      catch (error) {
        if (error instanceof RunEventLogFatalError)
          throw error
      }
    }
    return run
  }

  #requireRun(runId: string): RunRecord {
    const run = this.#repository.findById(runId)
    if (!run)
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    return run
  }
}

function isTerminal(status: RunStatus): status is TerminalRunStatus {
  return status === 'cancelled' || status === 'completed' || status === 'failed'
}
