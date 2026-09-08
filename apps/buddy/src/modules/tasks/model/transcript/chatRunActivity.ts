import type { LocalRun, LocalRunEvent } from '@buddy-shared/runs/runApi'

export function projectLatestRunActivity(
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): LocalRunEvent | null {
  const activeRunIds = new Set(runs
    .filter(run => run.status === 'queued' || run.status === 'running')
    .map(run => run.id))
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (
      activeRunIds.has(event.runId)
      && !event.type.startsWith('message.')
      && !event.type.startsWith('session.')
      && !event.type.startsWith('usage.')
    ) {
      return event
    }
  }
  return null
}
