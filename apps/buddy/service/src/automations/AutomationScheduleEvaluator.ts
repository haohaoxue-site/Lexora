import type {
  AutomationFrequency,
  AutomationPreviewRequest,
  AutomationPreviewResult,
  AutomationSchedule,
  AutomationTiming,
} from '../../../shared/automation'
import {
  automationPreviewRequestSchema,
  automationTimingSchema,
} from '../../../shared/automation'

const NANOSECONDS_PER_HOUR = 3_600_000_000_000n

export interface AutomationClock {
  now: () => Temporal.Instant
}

export const systemAutomationClock: AutomationClock = Object.freeze({
  now: () => Temporal.Now.instant(),
})

export function previewAutomationSchedule(
  input: AutomationPreviewRequest,
  clock: AutomationClock = systemAutomationClock,
): AutomationPreviewResult {
  const request = automationPreviewRequestSchema.parse(input)
  const parsed = automationTimingSchema.safeParse(request.timing)
  if (!parsed.success) {
    return {
      issues: uniqueIssuePaths(parsed.error.issues.map(issue => issue.path)),
      valid: false,
    }
  }

  const timing = normalizeAutomationTiming(parsed.data)
  const now = clock.now()
  if (
    timing.schedule.kind === 'once'
    && Temporal.Instant.compare(Temporal.Instant.from(timing.schedule.runAt), now) <= 0
  ) {
    return invalidSchedule(['schedule', 'runAt'])
  }
  if (!hasOccurrenceInActiveRange(timing))
    return invalidSchedule(['schedule'])

  const samples: string[] = []
  let after = now
  const sampleCount = request.sampleCount ?? 3
  for (let index = 0; index < sampleCount; index += 1) {
    const next = findNextOccurrence(timing, after)
    if (!next)
      break
    samples.push(formatInstant(next))
    after = next
  }

  return {
    frequency: createAutomationFrequency(timing),
    nextRunAt: samples[0] ?? null,
    normalizedTiming: timing,
    samples,
    valid: true,
  }
}

export function findNextAutomationOccurrence(
  timing: AutomationTiming,
  after: Temporal.Instant,
): Temporal.Instant | null {
  return findNextOccurrence(normalizeAutomationTiming(automationTimingSchema.parse(timing)), after)
}

export function normalizeAutomationTiming(timing: AutomationTiming): AutomationTiming {
  const timezone = new Intl.DateTimeFormat('en-US', {
    timeZone: timing.timezone,
  }).resolvedOptions().timeZone
  const schedule = normalizeSchedule(timing.schedule)
  return automationTimingSchema.parse({ ...timing, schedule, timezone })
}

function normalizeSchedule(schedule: AutomationSchedule): AutomationSchedule {
  if (schedule.kind === 'once') {
    return {
      kind: 'once',
      runAt: formatInstant(Temporal.Instant.from(schedule.runAt)),
    }
  }
  if (schedule.kind === 'interval') {
    const anchorAt = formatInstant(Temporal.Instant.from(schedule.anchorAt))
    return schedule.unit === 'hour'
      ? { anchorAt, every: schedule.every, kind: 'interval', unit: 'hour' }
      : { anchorAt, every: schedule.every, kind: 'interval', unit: 'day' }
  }
  if (schedule.cadence === 'weekly') {
    return {
      ...schedule,
      weekdays: [...new Set(schedule.weekdays)].sort((left, right) => left - right),
    }
  }
  return schedule
}

function findNextOccurrence(
  timing: AutomationTiming,
  after: Temporal.Instant,
): Temporal.Instant | null {
  const schedule = timing.schedule
  if (schedule.kind === 'once') {
    const runAt = Temporal.Instant.from(schedule.runAt)
    return Temporal.Instant.compare(runAt, after) > 0 ? runAt : null
  }
  if (schedule.kind === 'interval') {
    return schedule.unit === 'hour'
      ? findNextHourlyInterval({ ...timing, schedule }, after)
      : findNextDailyInterval({ ...timing, schedule }, after)
  }
  switch (schedule.cadence) {
    case 'daily':
      return findNextDailyCalendar({ ...timing, schedule }, after)
    case 'weekly':
      return findNextWeeklyCalendar({ ...timing, schedule }, after)
    case 'monthly':
      return findNextMonthlyCalendar({ ...timing, schedule }, after)
    case 'yearly':
      return findNextYearlyCalendar({ ...timing, schedule }, after)
  }
}

function findNextDailyCalendar(
  timing: CalendarTiming<'daily'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  let date = firstCandidateDate(timing, after)
  for (let index = 0; index < 3; index += 1) {
    if (isAfterActiveRange(timing, date))
      return null
    const candidate = calendarCandidate(timing, date)
    if (Temporal.Instant.compare(candidate, after) > 0)
      return candidate
    date = date.add({ days: 1 })
  }
  return null
}

function findNextWeeklyCalendar(
  timing: CalendarTiming<'weekly'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  return findNextWeekdayCalendar(timing, after)
}

function findNextWeekdayCalendar(
  timing: CalendarTiming<'weekly'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  let date = firstCandidateDate(timing, after)
  const weekdays = new Set(timing.schedule.weekdays)
  for (let index = 0; index < 15; index += 1) {
    if (isAfterActiveRange(timing, date))
      return null
    if (weekdays.has(date.dayOfWeek)) {
      const candidate = calendarCandidate(timing, date)
      if (Temporal.Instant.compare(candidate, after) > 0)
        return candidate
    }
    date = date.add({ days: 1 })
  }
  return null
}

function findNextMonthlyCalendar(
  timing: CalendarTiming<'monthly'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  const firstDate = firstCandidateDate(timing, after)
  let month = Temporal.PlainYearMonth.from({
    month: firstDate.month,
    year: firstDate.year,
  })
  for (let index = 0; index < 24; index += 1) {
    const requestedDay = timing.schedule.dayOfMonth === 'last'
      ? month.daysInMonth
      : timing.schedule.dayOfMonth
    if (requestedDay <= month.daysInMonth) {
      const date = month.toPlainDate({ day: requestedDay })
      if (isAfterActiveRange(timing, date))
        return null
      if (!isBeforeActiveRange(timing, date)) {
        const candidate = calendarCandidate(timing, date)
        if (Temporal.Instant.compare(candidate, after) > 0)
          return candidate
      }
    }
    month = month.add({ months: 1 })
  }
  return null
}

function findNextYearlyCalendar(
  timing: CalendarTiming<'yearly'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  const firstDate = firstCandidateDate(timing, after)
  for (let offset = 0; offset <= 400; offset += 1) {
    const year = firstDate.year + offset
    let date: Temporal.PlainDate
    try {
      date = Temporal.PlainDate.from({
        day: timing.schedule.day,
        month: timing.schedule.month,
        year,
      }, { overflow: 'reject' })
    }
    catch {
      continue
    }
    if (isAfterActiveRange(timing, date))
      return null
    if (isBeforeActiveRange(timing, date))
      continue
    const candidate = calendarCandidate(timing, date)
    if (Temporal.Instant.compare(candidate, after) > 0)
      return candidate
  }
  return null
}

function findNextHourlyInterval(
  timing: IntervalTiming<'hour'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  const anchor = Temporal.Instant.from(timing.schedule.anchorAt)
  const activeStart = timing.activeFrom
    ? startOfLocalDate(Temporal.PlainDate.from(timing.activeFrom), timing.timezone)
        .subtract({ nanoseconds: 1 })
    : null
  const threshold = activeStart && Temporal.Instant.compare(activeStart, after) > 0
    ? activeStart
    : after
  const step = BigInt(Math.round(timing.schedule.every * 10)) * (NANOSECONDS_PER_HOUR / 10n)
  const elapsed = threshold.epochNanoseconds - anchor.epochNanoseconds
  const occurrenceIndex = elapsed < 0n ? 0n : elapsed / step + 1n
  const candidate = Temporal.Instant.fromEpochNanoseconds(
    anchor.epochNanoseconds + occurrenceIndex * step,
  )
  return isInstantInActiveRange(timing, candidate) ? candidate : null
}

function findNextDailyInterval(
  timing: IntervalTiming<'day'>,
  after: Temporal.Instant,
): Temporal.Instant | null {
  const anchor = Temporal.Instant.from(timing.schedule.anchorAt).toZonedDateTimeISO(timing.timezone)
  const anchorDate = anchor.toPlainDate()
  let targetDate = after.toZonedDateTimeISO(timing.timezone).toPlainDate()
  if (timing.activeFrom) {
    const activeFrom = Temporal.PlainDate.from(timing.activeFrom)
    if (Temporal.PlainDate.compare(activeFrom, targetDate) > 0)
      targetDate = activeFrom
  }
  const elapsedDays = anchorDate.until(targetDate, { largestUnit: 'day' }).days
  let occurrenceIndex = elapsedDays > 0
    ? Math.floor(elapsedDays / timing.schedule.every)
    : 0
  for (let index = 0; index < 3; index += 1) {
    const date = anchorDate.add({ days: occurrenceIndex * timing.schedule.every })
    if (isAfterActiveRange(timing, date))
      return null
    const candidate = zonedDateTimeForDate(date, timing.timezone, {
      hour: anchor.hour,
      microsecond: anchor.microsecond,
      millisecond: anchor.millisecond,
      minute: anchor.minute,
      nanosecond: anchor.nanosecond,
      second: anchor.second,
    }).toInstant()
    if (
      !isBeforeActiveRange(timing, date)
      && Temporal.Instant.compare(candidate, after) > 0
    ) {
      return candidate
    }
    occurrenceIndex += 1
  }
  return null
}

function hasOccurrenceInActiveRange(timing: AutomationTiming): boolean {
  if (timing.schedule.kind === 'once')
    return true
  if (timing.activeFrom === null && timing.schedule.kind === 'calendar')
    return true

  let threshold: Temporal.Instant
  if (timing.activeFrom) {
    threshold = startOfLocalDate(Temporal.PlainDate.from(timing.activeFrom), timing.timezone)
      .subtract({ nanoseconds: 1 })
  }
  else {
    if (timing.schedule.kind !== 'interval')
      return true
    threshold = Temporal.Instant.from(timing.schedule.anchorAt).subtract({ nanoseconds: 1 })
  }
  return findNextOccurrence(timing, threshold) !== null
}

function firstCandidateDate(
  timing: AutomationTiming,
  after: Temporal.Instant,
): Temporal.PlainDate {
  const afterDate = after.toZonedDateTimeISO(timing.timezone).toPlainDate()
  if (!timing.activeFrom)
    return afterDate
  const activeFrom = Temporal.PlainDate.from(timing.activeFrom)
  return Temporal.PlainDate.compare(activeFrom, afterDate) > 0 ? activeFrom : afterDate
}

function calendarCandidate(
  timing: CalendarTiming,
  date: Temporal.PlainDate,
): Temporal.Instant {
  const [hour, minute] = timing.schedule.localTime.split(':')
  return zonedDateTimeForDate(date, timing.timezone, {
    hour: Number(hour),
    minute: Number(minute),
  }).toInstant()
}

function zonedDateTimeForDate(
  date: Temporal.PlainDate,
  timezone: string,
  time: {
    hour: number
    microsecond?: number
    millisecond?: number
    minute: number
    nanosecond?: number
    second?: number
  },
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({
    day: date.day,
    hour: time.hour,
    microsecond: time.microsecond ?? 0,
    millisecond: time.millisecond ?? 0,
    minute: time.minute,
    month: date.month,
    nanosecond: time.nanosecond ?? 0,
    second: time.second ?? 0,
    timeZone: timezone,
    year: date.year,
  }, { disambiguation: 'compatible' })
}

function startOfLocalDate(date: Temporal.PlainDate, timezone: string): Temporal.Instant {
  return zonedDateTimeForDate(date, timezone, { hour: 0, minute: 0 }).toInstant()
}

function isBeforeActiveRange(timing: AutomationTiming, date: Temporal.PlainDate): boolean {
  return Boolean(
    timing.activeFrom
    && Temporal.PlainDate.compare(date, Temporal.PlainDate.from(timing.activeFrom)) < 0,
  )
}

function isAfterActiveRange(timing: AutomationTiming, date: Temporal.PlainDate): boolean {
  return Boolean(
    timing.activeUntil
    && Temporal.PlainDate.compare(date, Temporal.PlainDate.from(timing.activeUntil)) > 0,
  )
}

function isInstantInActiveRange(timing: AutomationTiming, instant: Temporal.Instant): boolean {
  const date = instant.toZonedDateTimeISO(timing.timezone).toPlainDate()
  return !isBeforeActiveRange(timing, date) && !isAfterActiveRange(timing, date)
}

function createAutomationFrequency(timing: AutomationTiming): AutomationFrequency {
  const schedule = timing.schedule
  if (schedule.kind === 'once')
    return { ...schedule, timezone: timing.timezone }
  if (schedule.kind === 'interval') {
    return schedule.unit === 'hour'
      ? { ...schedule, unit: 'hour', timezone: timing.timezone }
      : { ...schedule, unit: 'day', timezone: timing.timezone }
  }
  switch (schedule.cadence) {
    case 'daily':
      return { ...schedule, timezone: timing.timezone }
    case 'weekly':
      return { ...schedule, timezone: timing.timezone }
    case 'monthly':
      return { ...schedule, timezone: timing.timezone }
    case 'yearly':
      return { ...schedule, timezone: timing.timezone }
  }
}

function invalidSchedule(path: Array<string | number>): AutomationPreviewResult {
  return {
    issues: [{ code: 'AUTOMATION_INVALID_SCHEDULE', path }],
    valid: false,
  }
}

function uniqueIssuePaths(
  paths: ReadonlyArray<ReadonlyArray<PropertyKey>>,
): Extract<AutomationPreviewResult, { valid: false }>['issues'] {
  const seen = new Set<string>()
  const issues: Extract<AutomationPreviewResult, { valid: false }>['issues'][number][] = []
  for (const sourcePath of paths) {
    const path = sourcePath.filter((part): part is string | number => (
      typeof part === 'string' || (typeof part === 'number' && Number.isInteger(part) && part >= 0)
    ))
    const normalizedPath = path.length > 0 ? path : ['timing']
    const key = JSON.stringify(normalizedPath)
    if (seen.has(key))
      continue
    seen.add(key)
    issues.push({ code: 'AUTOMATION_INVALID_SCHEDULE', path: normalizedPath })
  }
  return issues.length > 0 ? issues : [{ code: 'AUTOMATION_INVALID_SCHEDULE', path: ['timing'] }]
}

function formatInstant(instant: Temporal.Instant): string {
  return instant.toString({ smallestUnit: 'millisecond' })
}

type CalendarSchedule<
  Cadence extends Extract<AutomationSchedule, { kind: 'calendar' }>['cadence'] = Extract<AutomationSchedule, { kind: 'calendar' }>['cadence'],
> = Extract<AutomationSchedule, { kind: 'calendar', cadence: Cadence }>

type CalendarTiming<Cadence extends CalendarSchedule['cadence'] = CalendarSchedule['cadence']>
  = Omit<AutomationTiming, 'schedule'> & { schedule: CalendarSchedule<Cadence> }

type IntervalTiming<Unit extends Extract<AutomationSchedule, { kind: 'interval' }>['unit']>
  = Omit<AutomationTiming, 'schedule'> & {
    schedule: Extract<AutomationSchedule, { kind: 'interval', unit: Unit }>
  }
