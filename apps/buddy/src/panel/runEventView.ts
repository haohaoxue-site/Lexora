import type { BuddyTranslate } from '@/i18n/buddyI18n'
import type {
  BuddyRun,
  BuddyRunEvent,
  BuddyRunEventCount,
  BuddyRunEventSummary,
  BuddyRunEventType,
} from '@/lib/tauriRuntime'
import {
  extractPatchChangeFilePaths,
  extractUnifiedDiffFilePaths,
  normalizeRunEventPayload,
  readRunEventFilePaths,
  readRunEventPayloadString,
  stringifyRunEventPayloadPreview,
} from '@/lib/runEventPayload'

export interface BuddyRunEventViewRow {
  id: number
  key: number
  summary: string
  title: string
}

export interface BuddyConversationLogRunRow {
  runtime: BuddyRun['runtime']
  completedAt: string | null
  eventCount: number
  id: string
  key: string
  startedAt: string
  status: BuddyRun['status']
  subtitle: string
  title: string
}

export function createConversationLogRunRows(
  runs: ReadonlyArray<BuddyRun>,
  eventCounts: ReadonlyArray<BuddyRunEventCount>,
  t: BuddyTranslate,
): ReadonlyArray<BuddyConversationLogRunRow> {
  const eventCountByRunId = eventCounts.reduce<Record<string, number>>((counts, item) => {
    counts[item.runId] = item.eventCount
    return counts
  }, {})

  return runs.map(run => ({
    runtime: run.runtime,
    completedAt: run.completedAt,
    eventCount: eventCountByRunId[run.id] ?? 0,
    id: run.id,
    key: run.id,
    startedAt: run.startedAt,
    status: run.status,
    subtitle: run.cwd || t('log.globalScope'),
    title: t('log.conversationRunTitle', { runtime: resolveRuntimeLabel(run.runtime) }),
  }))
}

export function createRunEventSummaryViewRows(
  events: ReadonlyArray<BuddyRunEventSummary>,
  t: BuddyTranslate,
): ReadonlyArray<BuddyRunEventViewRow> {
  return events.map(event => ({
    id: event.id,
    key: event.id,
    summary: summarizeRunEventSummaryPayload(event, t),
    title: resolveRunEventTitle(event.eventType, t),
  }))
}

export function createRunEventViewRows(
  events: ReadonlyArray<BuddyRunEvent>,
  t: BuddyTranslate,
): ReadonlyArray<BuddyRunEventViewRow> {
  return events.map(event => ({
    id: event.id,
    key: event.id,
    summary: summarizeEventPayload(event, t),
    title: resolveRunEventTitle(event.eventType, t),
  }))
}

function summarizeRunEventSummaryPayload(event: BuddyRunEventSummary, t: BuddyTranslate) {
  const payload = parseRunEventSummaryPayload(event)
  if (payload !== null) {
    return summarizeEventPayload({
      createdAt: event.createdAt,
      eventType: event.eventType,
      id: event.id,
      payload,
      runId: event.runId,
    }, t)
  }

  return formatTruncatedPayloadPreview(event)
}

function parseRunEventSummaryPayload(event: BuddyRunEventSummary): unknown | null {
  if (event.payloadPreview.length < event.payloadChars)
    return null

  try {
    return JSON.parse(event.payloadPreview)
  }
  catch {
    return event.payloadPreview
  }
}

function formatTruncatedPayloadPreview(event: BuddyRunEventSummary) {
  if (!event.payloadPreview)
    return `(${event.payloadChars} chars)`

  return `${event.payloadPreview}... (${event.payloadChars} chars)`
}

export function resolveRunStatusLabel(status: BuddyRun['status'], t: BuddyTranslate) {
  if (status === 'cancelled')
    return t('run.status.cancelled')

  if (status === 'completed')
    return t('run.status.completed')

  if (status === 'failed')
    return t('run.status.failed')

  if (status === 'queued')
    return t('run.status.queued')

  return t('run.status.running')
}

function resolveRuntimeLabel(runtime: BuddyRun['runtime']) {
  return runtime === 'codex' ? 'Codex' : 'Claude'
}

function resolveRunEventTitle(eventType: BuddyRunEventType, t: BuddyTranslate) {
  if (eventType === 'approval.requested')
    return t('event.approvalRequested')

  if (eventType === 'approval.resolved')
    return t('event.approvalResolved')

  if (eventType === 'animation.intent')
    return t('event.animationIntent')

  if (eventType === 'assistant.references')
    return t('event.assistantReferences')

  if (eventType === 'codex.notification')
    return t('event.codexNotification')

  if (eventType === 'memory.context_pack')
    return t('event.memoryContextPack')

  if (eventType === 'memory.candidate.created')
    return t('event.memoryCandidateCreated')

  if (eventType === 'message.completed')
    return t('event.messageCompleted')

  if (eventType === 'message.delta')
    return t('event.messageDelta')

  if (eventType === 'plan.delta')
    return t('event.planDelta')

  if (eventType === 'plan.updated')
    return t('event.planUpdated')

  if (eventType === 'reasoning.completed')
    return t('event.reasoningCompleted')

  if (eventType === 'reasoning.delta')
    return t('event.reasoningDelta')

  if (eventType === 'reasoning.summary_part_added')
    return t('event.reasoningSummaryPartAdded')

  if (eventType === 'reasoning.summary_delta')
    return t('event.reasoningSummaryDelta')

  if (eventType === 'router.decision')
    return t('event.routerDecision')

  if (eventType === 'run.cancelled')
    return t('event.runCancelled')

  if (eventType === 'run.completed')
    return t('event.runCompleted')

  if (eventType === 'run.external_refs.updated')
    return t('event.runExternalRefsUpdated')

  if (eventType === 'run.failed')
    return t('event.runFailed')

  if (eventType === 'run.started')
    return t('event.runStarted')

  if (eventType === 'tool.finished')
    return t('event.toolFinished')

  if (eventType === 'tool.output_delta')
    return t('event.toolOutputDelta')

  if (eventType === 'tool.patch_updated')
    return t('event.toolPatchUpdated')

  if (eventType === 'tool.progress')
    return t('event.toolProgress')

  if (eventType === 'tool.started')
    return t('event.toolStarted')

  if (eventType === 'tool.terminal_interaction')
    return t('event.toolTerminalInteraction')

  if (eventType === 'turn.diff.updated')
    return t('event.turnDiffUpdated')

  if (eventType === 'user_input.requested')
    return t('event.userInputRequested')

  return t('event.turnCompleted')
}

function summarizeEventPayload(event: BuddyRunEvent, t: BuddyTranslate) {
  const payload = normalizeRunEventPayload(event.payload)

  if (event.eventType === 'turn.diff.updated') {
    return summarizeFilePaths(
      readRunEventFilePaths(
        payload,
        () => extractUnifiedDiffFilePaths(readRunEventPayloadString(payload, 'diff')),
      ),
      t,
    )
  }

  if (event.eventType === 'tool.patch_updated') {
    return summarizeFilePaths(
      readRunEventFilePaths(payload, () => extractPatchChangeFilePaths(payload.changes)),
      t,
    )
  }

  if (event.eventType === 'assistant.references')
    return summarizeAssistantReferences(payload, t)

  if (event.eventType === 'memory.context_pack')
    return t('references.sourceCount', { count: readPayloadNumber(payload, 'sourceCount') })

  if (event.eventType === 'router.decision')
    return summarizeRouterDecision(payload)

  if (event.eventType === 'run.external_refs.updated') {
    return readRunEventPayloadString(payload, 'externalThreadId')
      ?? readRunEventPayloadString(payload, 'externalRunId')
      ?? summarizePayload(event.payload)
  }

  return summarizePayload(event.payload)
}

function summarizeRouterDecision(payload: Record<string, unknown>) {
  return readRunEventPayloadString(payload, 'reason')
    ?? readRunEventPayloadString(payload, 'intent')
    ?? summarizePayload(payload)
}

function summarizeAssistantReferences(payload: Record<string, unknown>, t: BuddyTranslate) {
  const citation = normalizeRunEventPayload(payload.citation)
  const entries = Array.isArray(citation.entries) ? citation.entries : []
  if (entries.length === 0)
    return t('references.parseFailed')

  return t('references.entryCount', { count: entries.length })
}

function summarizePayload(payload: unknown) {
  return stringifyRunEventPayloadPreview(payload)
}

function summarizeFilePaths(paths: ReadonlyArray<string>, t: BuddyTranslate) {
  if (paths.length === 0)
    return t('activity.diffUpdated')

  return paths.join(', ')
}

function readPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  return 0
}
