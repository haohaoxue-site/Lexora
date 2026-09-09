import type { RunRecord } from '../storage/runRecord'
import type { ActiveRunSession } from './ActiveRunRegistry'
import type { StartBuddyCompactionInput, StartBuddyTurnInput } from './BuddyAgentRun'
import type { BuddySessionIdentity } from './BuddySessionBlueprint'

export type RunExecutionOutcome
  = | { status: 'completed' }
    | { errorCode: string | null, status: 'cancelled' }
    | { errorCode: string, errorMessage?: string, status: 'failed' }

interface RunExecutionContext {
  identity: BuddySessionIdentity
  onSessionActivated: (session: ActiveRunSession) => void
  run: RunRecord
  signal: AbortSignal
  timestamp: () => string
}

export interface RunExecutionBackend {
  executeTurn: (input: RunExecutionContext & {
    input: StartBuddyTurnInput
    onSessionStartupTimeout: () => void
  }) => Promise<RunExecutionOutcome>
  executeCompaction: (input: RunExecutionContext & {
    input: StartBuddyCompactionInput
  }) => Promise<RunExecutionOutcome>
  invalidateSessionContinuityAfterFailure: (input: {
    error: unknown
    identity: BuddySessionIdentity
    runId: string
  }) => Promise<void>
}
