import type { Automation } from '../../../shared/automation'
import type { AutomationOccurrenceRecord } from '../storage/automationOccurrenceRecord'
import type { AutomationClock } from './AutomationScheduleEvaluator'
import type { AutomationService } from './AutomationService'
import { randomUUID } from 'node:crypto'
import { Temporal } from '../../../shared/temporal'
import { findNextAutomationOccurrence, systemAutomationClock } from './AutomationScheduleEvaluator'

export const AUTOMATION_POLL_INTERVAL_MS = 30_000
export const AUTOMATION_CATCH_UP_WINDOW_HOURS = 24
export const AUTOMATION_GLOBAL_CONCURRENCY = 2

const AUTOMATION_LEASE_DURATION_MINUTES = 1
const AUTOMATION_DUE_BATCH_SIZE = 100
const MAX_RECENT_CANDIDATES = 48

export interface AutomationSchedulerOptions {
  automationService: AutomationService
  clock?: AutomationClock
  createOwnerId?: () => string
  dispatch: (occurrence: AutomationOccurrenceRecord) => Promise<void>
  onChanged?: (automationId: string) => void
}

export class AutomationScheduler {
  readonly #automationService: AutomationService
  readonly #clock: AutomationClock
  readonly #dispatch: AutomationSchedulerOptions['dispatch']
  readonly #onChanged: NonNullable<AutomationSchedulerOptions['onChanged']>
  readonly #owner: string
  readonly #activeDispatches = new Map<string, Promise<void>>()
  #disposed = false
  #pollTimer: ReturnType<typeof setInterval> | null = null
  #scan: Promise<void> | null = null
  #started = false

  constructor(options: AutomationSchedulerOptions) {
    this.#automationService = options.automationService
    this.#clock = options.clock ?? systemAutomationClock
    this.#dispatch = options.dispatch
    this.#onChanged = options.onChanged ?? (() => {})
    this.#owner = (options.createOwnerId ?? randomUUID)()
  }

  async dispose(): Promise<void> {
    this.#disposed = true
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer)
      this.#pollTimer = null
    }
    await this.#scan
  }

  async start(): Promise<void> {
    if (this.#started)
      return
    this.#started = true
    await this.#requestScan()
    if (this.#disposed)
      return
    this.#pollTimer = setInterval(() => {
      void this.wake()
    }, AUTOMATION_POLL_INTERVAL_MS)
  }

  wake(): Promise<void> {
    if (this.#disposed)
      return Promise.resolve()
    return this.#requestScan()
  }

  #requestScan(): Promise<void> {
    if (this.#scan)
      return this.#scan
    const scan = this.#runScan().finally(() => {
      if (this.#scan === scan)
        this.#scan = null
    })
    this.#scan = scan
    return scan
  }

  async #runScan(): Promise<void> {
    if (this.#disposed)
      return
    const now = this.#clock.now()
    const nowText = formatInstant(now)
    for (let batch = 0; batch < 100 && !this.#disposed; batch += 1) {
      const due = this.#automationService.listDue(nowText, AUTOMATION_DUE_BATCH_SIZE)
      if (due.length === 0)
        break
      for (const automation of due) {
        if (this.#disposed)
          break
        this.#processDueAutomation(automation, now)
      }
      if (due.length < AUTOMATION_DUE_BATCH_SIZE)
        break
    }
    if (!this.#disposed)
      this.#dispatchAvailable()
  }

  #processDueAutomation(
    automation: Automation,
    now: Temporal.Instant,
  ): void {
    if (!automation.nextRunAt)
      return
    const earliest = Temporal.Instant.from(automation.nextRunAt)
    const isOnce = automation.timing.schedule.kind === 'once'
    const cutoff = now.subtract({ hours: AUTOMATION_CATCH_UP_WINDOW_HOURS })
    if (Temporal.Instant.compare(earliest, cutoff) < 0) {
      this.#settleMissed(
        automation,
        now,
        isOnce ? 'expired' : 'skipped',
        'MISSED_WINDOW_EXCEEDED',
      )
      return
    }

    const candidates = collectDueCandidates(automation, now)
    const latest = candidates.at(-1)
    if (!latest)
      return
    const common = {
      advanceAfter: formatInstant(now),
      automationId: automation.id,
      coalescedMissedCount: candidates.length - 1,
      expectedNextRunAt: automation.nextRunAt,
      expectedRevision: automation.revision,
      scheduledFor: formatInstant(latest),
    }
    const occurrence = this.#automationService.claimScheduled(common)
    if (occurrence)
      this.#onChanged(automation.id)
  }

  #settleMissed(
    automation: Automation,
    now: Temporal.Instant,
    status: 'expired' | 'skipped',
    errorCode: 'MISSED_WINDOW_EXCEEDED',
  ): void {
    if (!automation.nextRunAt)
      return
    const occurrence = this.#automationService.settleScheduled({
      advanceAfter: formatInstant(now),
      automationId: automation.id,
      coalescedMissedCount: 0,
      errorCode,
      expectedNextRunAt: automation.nextRunAt,
      expectedRevision: automation.revision,
      scheduledFor: automation.nextRunAt,
      status,
    })
    if (occurrence)
      this.#onChanged(automation.id)
  }

  #dispatchAvailable(): void {
    if (this.#disposed)
      return
    const available = AUTOMATION_GLOBAL_CONCURRENCY - this.#activeDispatches.size
    if (available <= 0)
      return
    const now = this.#clock.now()
    const leased = this.#automationService.leaseQueued({
      leaseExpiresAt: formatInstant(now.add({ minutes: AUTOMATION_LEASE_DURATION_MINUTES })),
      limit: available,
      now: formatInstant(now),
      owner: this.#owner,
    })
    for (const occurrence of leased) {
      const dispatch = Promise.resolve()
        .then(() => this.#dispatch(occurrence))
        .catch(() => {
          this.#automationService.finishQueued({
            errorCode: 'RUNTIME_RESTARTED',
            id: occurrence.id,
            leaseOwner: this.#owner,
            status: 'skipped',
          })
        })
        .then(() => {})
        .finally(() => {
          this.#activeDispatches.delete(occurrence.id)
          if (!this.#disposed)
            this.#dispatchAvailable()
        })
      this.#activeDispatches.set(occurrence.id, dispatch)
    }
  }
}

function collectDueCandidates(
  automation: Automation,
  now: Temporal.Instant,
): Temporal.Instant[] {
  if (!automation.nextRunAt)
    return []
  const candidates: Temporal.Instant[] = []
  let candidate: Temporal.Instant | null = Temporal.Instant.from(automation.nextRunAt)
  while (
    candidate
    && Temporal.Instant.compare(candidate, now) <= 0
    && candidates.length < MAX_RECENT_CANDIDATES
  ) {
    candidates.push(candidate)
    candidate = findNextAutomationOccurrence(automation.timing, candidate)
  }
  return candidates
}

function formatInstant(value: Temporal.Instant): string {
  return value.toString({ smallestUnit: 'millisecond' })
}
