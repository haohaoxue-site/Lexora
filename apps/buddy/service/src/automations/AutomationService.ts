import type { DatabaseSync } from 'node:sqlite'
import type {
  Automation,
  AutomationDefinitionDraft,
  AutomationErrorCode,
  AutomationMutationTargetRequest,
  CreateAutomationRequest,
  UpdateAutomationRequest,
} from '../../../shared/automation'
import type { AutomationMutationOperation } from '../storage/automationMutationRequestRepository'
import type {
  AutomationCursor,
  AutomationOccurrenceRecord,
  AutomationPageRecord,
} from '../storage/automationRepository'
import type { AutomationClock } from './AutomationScheduleEvaluator'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  automationDefinitionDraftSchema,
  automationLifecycleStatusSchema,
  automationMutationRequestSchemas,
} from '../../../shared/automation'
import {
  AutomationRepositoryError,
  createAutomationRepository,
} from '../storage/automationRepository'
import {
  findNextAutomationOccurrence,
  previewAutomationSchedule,
  systemAutomationClock,
} from './AutomationScheduleEvaluator'

const cursorSchema = z.object({
  id: z.string().trim().min(1).max(256),
  occurredAt: z.iso.datetime(),
}).strict()

export interface AutomationPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface AutomationServiceOptions {
  clock?: AutomationClock
  createId?: () => string
  database: DatabaseSync
}

export class AutomationServiceError extends Error {
  readonly code: AutomationErrorCode

  constructor(code: AutomationErrorCode) {
    super(`Lexora Buddy automation operation failed: ${code}`)
    this.name = 'AutomationServiceError'
    this.code = code
  }
}

export class AutomationService {
  readonly #clock: AutomationClock
  readonly #createId: () => string
  readonly #repository: ReturnType<typeof createAutomationRepository>

  constructor(options: AutomationServiceOptions) {
    this.#clock = options.clock ?? systemAutomationClock
    this.#createId = options.createId ?? randomUUID
    this.#repository = createAutomationRepository(options.database)
  }

  claimScheduled(input: {
    advanceAfter?: string
    automationId: string
    coalescedMissedCount: number
    expectedNextRunAt?: string
    expectedRevision: number
    scheduledFor: string
  }): AutomationOccurrenceRecord | null {
    const automation = this.#repository.findById(input.automationId)
    const expectedNextRunAt = normalizeInstant(input.expectedNextRunAt ?? input.scheduledFor)
    if (
      !automation
      || automation.revision !== input.expectedRevision
      || automation.status !== 'active'
      || automation.nextRunAt !== expectedNextRunAt
    ) {
      return null
    }
    const advanceAfter = normalizeInstant(input.advanceAfter ?? input.scheduledFor)
    const next = findNextAutomationOccurrence(
      automation.timing,
      Temporal.Instant.from(advanceAfter),
    )
    return this.#repository.claimScheduled({
      automationId: automation.id,
      coalescedMissedCount: input.coalescedMissedCount,
      expectedNextRunAt,
      expectedRevision: automation.revision,
      id: this.#createId(),
      nextRunAt: next ? formatInstant(next) : null,
      queuedAt: this.#now(),
      scheduledFor: normalizeInstant(input.scheduledFor),
    })
  }

  block(input: {
    automationId: string
    expectedRevision: number
    reason: NonNullable<Automation['blockedReason']>
  }): Automation | null {
    return this.#repository.block({
      automationId: input.automationId,
      blockedAt: this.#now(),
      expectedRevision: input.expectedRevision,
      reason: input.reason,
    })
  }

  blockPinnedModel(providerId: string, modelId?: string): Automation[] {
    return this.#repository.blockActiveByPinnedModel({
      blockedAt: this.#now(),
      modelId: modelId
        ? z.string().trim().min(1).max(256).parse(modelId)
        : undefined,
      providerId: z.string().trim().min(1).max(256).parse(providerId),
    })
  }

  blockProject(projectId: string): Automation[] {
    return this.#repository.blockActiveByProject({
      blockedAt: this.#now(),
      projectId: z.string().trim().min(1).max(256).parse(projectId),
    })
  }

  bindProjectIfUnassigned(input: {
    automationId: string
    expectedRevision: number
    projectId: string
  }): Automation | null {
    return this.#repository.bindProjectIfUnassigned({
      automationId: z.string().trim().min(1).max(256).parse(input.automationId),
      boundAt: this.#now(),
      expectedRevision: z.number().int().positive().parse(input.expectedRevision),
      projectId: z.string().trim().min(1).max(256).parse(input.projectId),
    })
  }

  create(input: CreateAutomationRequest): Automation {
    const request = automationMutationRequestSchemas.create.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('create', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayAutomationMutation(mutation),
    )
    if (replay)
      return replay
    const automation = this.#buildAutomation({
      createdAt: now,
      draft: request.draft,
      id: this.#createId(),
      lastRunAt: null,
      revision: 1,
      updatedAt: now,
    })
    return this.#mapRepositoryError(() => this.#repository.create(
      automation,
      mutation,
    ))
  }

  delete(input: AutomationMutationTargetRequest): Automation {
    const request = automationMutationRequestSchemas.delete.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('delete', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayAutomationMutation(mutation),
    )
    if (replay)
      return replay
    const existing = this.#requireAutomation(request.automationId)
    return this.#mapRepositoryError(() => this.#repository.replace({
      automation: {
        ...existing,
        blockedReason: null,
        nextRunAt: null,
        revision: existing.revision + 1,
        status: 'completed',
        updatedAt: now,
      },
      cancelQueued: true,
      expectedRevision: request.expectedRevision,
    }, mutation))
  }

  get(id: string): Automation | null {
    return this.#repository.findById(id)
  }

  getOccurrence(id: string): AutomationOccurrenceRecord | null {
    return this.#repository.findOccurrenceById(id)
  }

  getOccurrenceByConversationId(conversationId: string): AutomationOccurrenceRecord | null {
    return this.#repository.findOccurrenceByConversationId(
      z.string().trim().min(1).max(256).parse(conversationId),
    )
  }

  finishQueued(input: {
    errorCode: AutomationErrorCode
    errorSummary?: string | null
    id: string
    leaseOwner?: string | null
    status: 'cancelled' | 'expired' | 'skipped'
  }): AutomationOccurrenceRecord | null {
    return this.#repository.finishQueued({
      ...input,
      finishedAt: this.#now(),
    })
  }

  finishQueuedAndBlock(input: {
    automationId: string
    expectedRevision: number
    id: string
    leaseOwner: string
    reason: NonNullable<Automation['blockedReason']>
  }): {
    automation: Automation | null
    occurrence: AutomationOccurrenceRecord
  } | null {
    return this.#repository.finishQueuedAndBlock({
      ...input,
      finishedAt: this.#now(),
    })
  }

  hasNonTerminalRun(automationId: string): boolean {
    return this.#repository.hasNonTerminalRun(automationId)
  }

  leaseQueued(input: {
    leaseExpiresAt: string
    limit: number
    now: string
    owner: string
  }): AutomationOccurrenceRecord[] {
    const owner = z.string().trim().min(1).max(128).parse(input.owner)
    const limit = z.number().int().min(1).max(100).parse(input.limit)
    const now = normalizeInstant(input.now)
    const leaseExpiresAt = normalizeInstant(input.leaseExpiresAt)
    if (Temporal.Instant.compare(
      Temporal.Instant.from(leaseExpiresAt),
      Temporal.Instant.from(now),
    ) <= 0) {
      throw new AutomationServiceError('AUTOMATION_CONFLICT')
    }
    return this.#repository.leaseQueued({ leaseExpiresAt, limit, now, owner })
  }

  list(input: {
    cursor?: string | null
    limit?: number
    statuses?: Automation['status'][]
  } = {}): AutomationPage<Automation> {
    const limit = z.number().int().min(1).max(100).parse(input.limit ?? 50)
    const statuses = input.statuses?.map(status => automationLifecycleStatusSchema.parse(status))
    return encodePage(this.#repository.list({
      before: decodeCursor(input.cursor),
      limit,
      statuses,
    }))
  }

  listDue(now: string, limit = 100): Automation[] {
    return this.#repository.listDue(
      normalizeInstant(now),
      z.number().int().min(1).max(500).parse(limit),
    )
  }

  listHistory(input: {
    automationId?: string | null
    cursor?: string | null
    limit?: number
  }): AutomationPage<AutomationOccurrenceRecord> {
    const limit = z.number().int().min(1).max(100).parse(input.limit ?? 50)
    return encodePage(this.#repository.listHistory({
      automationId: input.automationId
        ? z.string().trim().min(1).max(256).parse(input.automationId)
        : null,
      before: decodeCursor(input.cursor),
      limit,
    }))
  }

  markOccurrenceDeleted(id: string): boolean {
    return this.#repository.markOccurrenceDeleted(
      z.string().trim().min(1).max(256).parse(id),
      this.#now(),
    )
  }

  pause(input: AutomationMutationTargetRequest): Automation {
    const request = automationMutationRequestSchemas.pause.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('pause', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayAutomationMutation(mutation),
    )
    if (replay)
      return replay
    const existing = this.#requireAutomation(request.automationId)
    return this.#mapRepositoryError(() => this.#repository.replace({
      automation: {
        ...existing,
        blockedReason: null,
        nextRunAt: null,
        revision: existing.revision + 1,
        status: 'paused',
        updatedAt: now,
      },
      cancelQueued: true,
      expectedRevision: request.expectedRevision,
    }, mutation))
  }

  resume(input: AutomationMutationTargetRequest): Automation {
    const request = automationMutationRequestSchemas.resume.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('resume', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayAutomationMutation(mutation),
    )
    if (replay)
      return replay
    const existing = this.#requireAutomation(request.automationId)
    const resumed = this.#buildAutomation({
      createdAt: existing.createdAt,
      draft: toDefinitionDraft(existing),
      id: existing.id,
      lastRunAt: existing.lastRunAt,
      revision: existing.revision + 1,
      updatedAt: now,
    })
    return this.#mapRepositoryError(() => this.#repository.replace({
      automation: resumed,
      cancelQueued: false,
      expectedRevision: request.expectedRevision,
    }, mutation))
  }

  runNow(input: AutomationMutationTargetRequest): AutomationOccurrenceRecord {
    const request = automationMutationRequestSchemas.runNow.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('run_now', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayOccurrenceMutation(mutation),
    )
    if (replay)
      return replay
    return this.#mapRepositoryError(() => this.#repository.createManualOccurrence({
      automationId: request.automationId,
      expectedRevision: request.expectedRevision,
      id: this.#createId(),
      queuedAt: now,
      scheduledFor: now,
    }, mutation))
  }

  settleScheduled(input: {
    advanceAfter: string
    automationId: string
    coalescedMissedCount: number
    errorCode: AutomationErrorCode
    errorSummary?: string | null
    expectedNextRunAt: string
    expectedRevision: number
    scheduledFor: string
    status: 'expired' | 'skipped'
  }): AutomationOccurrenceRecord | null {
    const automation = this.#repository.findById(input.automationId)
    if (
      !automation
      || automation.revision !== input.expectedRevision
      || automation.status !== 'active'
      || automation.nextRunAt !== normalizeInstant(input.expectedNextRunAt)
    ) {
      return null
    }
    const next = findNextAutomationOccurrence(
      automation.timing,
      Temporal.Instant.from(normalizeInstant(input.advanceAfter)),
    )
    return this.#repository.settleScheduled({
      automationId: automation.id,
      coalescedMissedCount: input.coalescedMissedCount,
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
      expectedNextRunAt: automation.nextRunAt,
      expectedRevision: automation.revision,
      finishedAt: this.#now(),
      id: this.#createId(),
      nextRunAt: next ? formatInstant(next) : null,
      scheduledFor: normalizeInstant(input.scheduledFor),
      status: input.status,
    })
  }

  update(input: UpdateAutomationRequest): Automation {
    const request = automationMutationRequestSchemas.update.parse(input)
    const now = this.#now()
    const mutation = mutationIdentity('update', request, now)
    const replay = this.#mapRepositoryError(
      () => this.#repository.replayAutomationMutation(mutation),
    )
    if (replay)
      return replay
    const existing = this.#requireAutomation(request.automationId)
    const updated = this.#buildAutomation({
      createdAt: existing.createdAt,
      draft: request.draft,
      id: existing.id,
      lastRunAt: existing.lastRunAt,
      revision: existing.revision + 1,
      updatedAt: now,
    })
    return this.#mapRepositoryError(() => this.#repository.replace({
      automation: updated,
      cancelQueued: false,
      expectedRevision: request.expectedRevision,
    }, mutation))
  }

  #buildAutomation(input: {
    createdAt: string
    draft: AutomationDefinitionDraft
    id: string
    lastRunAt: string | null
    revision: number
    updatedAt: string
  }): Automation {
    const draft = automationDefinitionDraftSchema.parse(input.draft)
    const preview = previewAutomationSchedule({ sampleCount: 1, timing: draft.timing }, this.#clock)
    if (!preview.valid)
      throw new AutomationServiceError('AUTOMATION_INVALID_SCHEDULE')
    return {
      blockedReason: null,
      createdAt: input.createdAt,
      executionProfile: draft.executionProfile,
      id: input.id,
      lastRunAt: input.lastRunAt,
      model: draft.model,
      name: draft.name,
      nextRunAt: preview.nextRunAt,
      projectId: draft.projectId,
      prompt: draft.prompt,
      revision: input.revision,
      status: preview.nextRunAt ? 'active' : 'completed',
      timing: preview.normalizedTiming,
      updatedAt: input.updatedAt,
    }
  }

  #mapRepositoryError<T>(operation: () => T): T {
    try {
      return operation()
    }
    catch (error) {
      if (!(error instanceof AutomationRepositoryError))
        throw error
      throw new AutomationServiceError(
        error.reason === 'not_found' ? 'AUTOMATION_NOT_FOUND' : 'AUTOMATION_CONFLICT',
      )
    }
  }

  #now(): string {
    return formatInstant(this.#clock.now())
  }

  #requireAutomation(id: string): Automation {
    const automation = this.#repository.findById(id)
    if (!automation)
      throw new AutomationServiceError('AUTOMATION_NOT_FOUND')
    return automation
  }
}

function mutationIdentity(
  operation: AutomationMutationOperation,
  request: object,
  createdAt: string,
) {
  const payload = { ...request, operation, requestId: undefined }
  return {
    createdAt,
    fingerprint: createHash('sha256').update(stableSerialize(payload)).digest('hex'),
    operation,
    requestId: 'requestId' in request ? String(request.requestId) : '',
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeInstant(value: string): string {
  return formatInstant(Temporal.Instant.from(value))
}

function formatInstant(value: Temporal.Instant): string {
  return value.toString({ smallestUnit: 'millisecond' })
}

function decodeCursor(value: string | null | undefined): AutomationCursor | null {
  if (!value)
    return null
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  }
  catch {
    throw new AutomationServiceError('AUTOMATION_CONFLICT')
  }
}

function encodePage<T>(page: AutomationPageRecord<T>): AutomationPage<T> {
  return {
    items: page.items,
    nextCursor: page.nextCursor
      ? Buffer.from(JSON.stringify(page.nextCursor), 'utf8').toString('base64url')
      : null,
  }
}

function toDefinitionDraft(automation: Automation): AutomationDefinitionDraft {
  return {
    executionProfile: automation.executionProfile,
    model: automation.model,
    name: automation.name,
    projectId: automation.projectId,
    prompt: automation.prompt,
    timing: automation.timing,
  }
}
