import type { BuddyChatRunEvent, BuddyRun } from '@/lib/tauriRuntime'

const TERMINAL_RUN_EVENT_TYPES = new Set([
  'run.cancelled',
  'run.completed',
  'run.failed',
])

const TERMINAL_RUN_STATUSES = new Set([
  'cancelled',
  'completed',
  'failed',
])

export interface BuddyRunPollingTerminal {
  event: BuddyChatRunEvent | null
  kind: 'cancelled' | 'completed' | 'failed'
  source: 'event' | 'run'
}

export function resolveRunPollingTerminal(options: {
  events: ReadonlyArray<BuddyChatRunEvent>
  run: BuddyRun | null | undefined
}): BuddyRunPollingTerminal | null {
  const terminalEvent = options.events.find(event =>
    TERMINAL_RUN_EVENT_TYPES.has(event.eventType),
  )
  if (terminalEvent) {
    return {
      event: terminalEvent,
      kind: terminalEvent.eventType.replace('run.', '') as BuddyRunPollingTerminal['kind'],
      source: 'event',
    }
  }

  if (options.run && TERMINAL_RUN_STATUSES.has(options.run.status)) {
    return {
      event: null,
      kind: options.run.status as BuddyRunPollingTerminal['kind'],
      source: 'run',
    }
  }

  return null
}

export function mergeBuddyRunSnapshots(
  currentRuns: ReadonlyArray<BuddyRun>,
  nextRuns: ReadonlyArray<BuddyRun>,
): ReadonlyArray<BuddyRun> {
  const nextById = new Map(nextRuns.map(run => [run.id, run]))
  const merged = currentRuns.map(run => nextById.get(run.id) ?? run)
  const existingIds = new Set(merged.map(run => run.id))

  return [
    ...nextRuns.filter(run => !existingIds.has(run.id)),
    ...merged,
  ]
}
