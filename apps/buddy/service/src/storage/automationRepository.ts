import type { DatabaseSync } from 'node:sqlite'
import type { ZodType } from 'zod'
import type {
  Automation,
  AutomationErrorCode,
  AutomationExecutionSnapshot,
  AutomationOccurrence,
} from '../../../shared/automation'
import type { AutomationMutationOperation } from './automationMutationRequestRepository'
import {
  automationExecutionSnapshotSchema,
  automationOccurrenceSchema,
  automationScheduleSchema,
  automationSchema,
} from '../../../shared/automation'
import { createAutomationMutationRequestRepository } from './automationMutationRequestRepository'
import { withTransaction } from './database'

export interface AutomationCursor {
  id: string
  occurredAt: string
}

export interface AutomationOccurrenceRecord extends AutomationOccurrence {
  dedupeKey: string
  executionSnapshot: AutomationExecutionSnapshot
  leaseExpiresAt: string | null
  leaseOwner: string | null
  requestId: string | null
}

export interface AutomationPageRecord<T> {
  items: T[]
  nextCursor: AutomationCursor | null
}

export interface AutomationMutationIdentity {
  createdAt: string
  fingerprint: string
  operation: AutomationMutationOperation
  requestId: string
}

export interface AutomationRepository {
  bindProjectIfUnassigned: (input: {
    automationId: string
    boundAt: string
    expectedRevision: number
    projectId: string
  }) => Automation | null
  block: (input: {
    automationId: string
    blockedAt: string
    expectedRevision: number
    reason: Automation['blockedReason'] & string
  }) => Automation | null
  blockActiveByPinnedModel: (input: {
    blockedAt: string
    modelId?: string
    providerId: string
  }) => Automation[]
  blockActiveByProject: (input: {
    blockedAt: string
    projectId: string
  }) => Automation[]
  claimScheduled: (input: {
    automationId: string
    coalescedMissedCount: number
    expectedNextRunAt: string
    expectedRevision: number
    id: string
    nextRunAt: string | null
    queuedAt: string
    scheduledFor: string
  }) => AutomationOccurrenceRecord | null
  create: (automation: Automation, mutation: AutomationMutationIdentity) => Automation
  createManualOccurrence: (input: {
    automationId: string
    expectedRevision: number
    id: string
    queuedAt: string
    scheduledFor: string
  }, mutation: AutomationMutationIdentity) => AutomationOccurrenceRecord
  findById: (id: string) => Automation | null
  findOccurrenceByConversationId: (conversationId: string) => AutomationOccurrenceRecord | null
  findOccurrenceById: (id: string) => AutomationOccurrenceRecord | null
  finishQueued: (input: {
    errorCode: AutomationErrorCode
    errorSummary?: string | null
    finishedAt: string
    id: string
    leaseOwner?: string | null
    status: 'cancelled' | 'expired' | 'skipped'
  }) => AutomationOccurrenceRecord | null
  finishQueuedAndBlock: (input: {
    automationId: string
    expectedRevision: number
    finishedAt: string
    id: string
    leaseOwner: string
    reason: Automation['blockedReason'] & string
  }) => {
    automation: Automation | null
    occurrence: AutomationOccurrenceRecord
  } | null
  hasNonTerminalRun: (automationId: string) => boolean
  leaseQueued: (input: {
    leaseExpiresAt: string
    limit: number
    now: string
    owner: string
  }) => AutomationOccurrenceRecord[]
  list: (input: {
    before?: AutomationCursor | null
    limit: number
    statuses?: Automation['status'][]
  }) => AutomationPageRecord<Automation>
  listDue: (now: string, limit: number) => Automation[]
  listHistory: (input: {
    automationId?: string | null
    before?: AutomationCursor | null
    limit: number
  }) => AutomationPageRecord<AutomationOccurrenceRecord>
  markOccurrenceDeleted: (id: string, deletedAt: string) => boolean
  replayAutomationMutation: (
    mutation: AutomationMutationIdentity,
  ) => Automation | null
  replayOccurrenceMutation: (
    mutation: AutomationMutationIdentity,
  ) => AutomationOccurrenceRecord | null
  settleScheduled: (input: {
    automationId: string
    coalescedMissedCount: number
    errorCode: AutomationErrorCode
    errorSummary?: string | null
    expectedNextRunAt: string
    expectedRevision: number
    finishedAt: string
    id: string
    nextRunAt: string | null
    scheduledFor: string
    status: 'expired' | 'skipped'
  }) => AutomationOccurrenceRecord | null
  replace: (input: {
    automation: Automation
    expectedRevision: number
    cancelQueued: boolean
  }, mutation: AutomationMutationIdentity) => Automation
}

interface AutomationRow {
  active_from: string | null
  active_until: string | null
  blocked_reason: Automation['blockedReason']
  created_at: string
  deleted_at: string | null
  execution_profile: Automation['executionProfile']
  id: string
  last_run_at: string | null
  model_id: string | null
  model_mode: Automation['model']['mode']
  name: string
  next_run_at: string | null
  project_id: string | null
  prompt: string
  provider_id: string | null
  reasoning: Extract<Automation['model'], { mode: 'pinned' }>['reasoning'] | null
  revision: number
  schedule_json: string
  schedule_kind: Automation['timing']['schedule']['kind']
  status: Automation['status']
  timezone: string
  updated_at: string
}

interface AutomationOccurrenceRow {
  automation_id: string
  automation_revision: number
  bound_at: string | null
  coalesced_missed_count: number
  conversation_id: string | null
  dedupe_key: string
  deleted_at: string | null
  error_code: AutomationErrorCode | null
  error_summary: string | null
  execution_snapshot_json: string
  finished_at: string | null
  id: string
  lease_expires_at: string | null
  lease_owner: string | null
  queued_at: string
  request_id: string | null
  run_id: string | null
  scheduled_for: string
  status: AutomationOccurrence['status']
  trigger_kind: AutomationOccurrence['triggerKind']
}

export class AutomationRepositoryError extends Error {
  readonly reason: 'conflict' | 'not_found'

  constructor(reason: 'conflict' | 'not_found') {
    super(`Lexora Buddy automation repository ${reason}`)
    this.name = 'AutomationRepositoryError'
    this.reason = reason
  }
}

export function createAutomationRepository(database: DatabaseSync): AutomationRepository {
  const mutations = createAutomationMutationRequestRepository(database)
  const findAny = database.prepare('SELECT * FROM automations WHERE id = ?')
  const findVisible = database.prepare(`
    SELECT * FROM automations WHERE id = ? AND deleted_at IS NULL
  `)
  const findOccurrence = database.prepare(`
    SELECT * FROM automation_occurrences WHERE id = ? AND deleted_at IS NULL
  `)
  const findOccurrenceByConversation = database.prepare(`
    SELECT * FROM automation_occurrences
    WHERE conversation_id = ? AND deleted_at IS NULL
  `)
  const bindProjectIfUnassigned = database.prepare(`
    UPDATE automations
    SET project_id = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ? AND project_id IS NULL AND deleted_at IS NULL
  `)
  const insertAutomation = database.prepare(`
    INSERT INTO automations (
      id, name, prompt, project_id, execution_profile, model_mode, provider_id, model_id, reasoning,
      schedule_kind, schedule_json, timezone, active_from, active_until,
      status, blocked_reason, next_run_at, last_run_at, deleted_at, revision,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `)
  const replaceAutomation = database.prepare(`
    UPDATE automations SET
      name = ?, prompt = ?, project_id = ?, execution_profile = ?, model_mode = ?, provider_id = ?,
      model_id = ?, reasoning = ?, schedule_kind = ?, schedule_json = ?,
      timezone = ?, active_from = ?, active_until = ?, status = ?,
      blocked_reason = ?, next_run_at = ?, deleted_at = ?, revision = ?, updated_at = ?
    WHERE id = ? AND revision = ? AND deleted_at IS NULL
  `)
  const cancelQueued = database.prepare(`
    UPDATE automation_occurrences
    SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
        finished_at = ?, error_code = NULL, error_summary = NULL
    WHERE automation_id = ? AND status = 'queued' AND run_id IS NULL
  `)
  const blockAutomation = database.prepare(`
    UPDATE automations
    SET status = 'blocked', blocked_reason = ?, next_run_at = NULL,
        revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ? AND deleted_at IS NULL
  `)
  const insertOccurrence = database.prepare(`
    INSERT INTO automation_occurrences (
      id, automation_id, request_id, dedupe_key, trigger_kind, scheduled_for,
      coalesced_missed_count, automation_revision, execution_snapshot_json,
      status, lease_owner, lease_expires_at, queued_at, bound_at, finished_at,
      conversation_id, run_id, error_code, error_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL)
  `)
  const insertTerminalOccurrence = database.prepare(`
    INSERT INTO automation_occurrences (
      id, automation_id, request_id, dedupe_key, trigger_kind, scheduled_for,
      coalesced_missed_count, automation_revision, execution_snapshot_json,
      status, lease_owner, lease_expires_at, queued_at, bound_at, finished_at,
      conversation_id, run_id, error_code, error_summary
    ) VALUES (?, ?, NULL, ?, 'scheduled', ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, NULL, NULL, ?, ?)
  `)
  const insertManualOverlap = database.prepare(`
    INSERT INTO automation_occurrences (
      id, automation_id, request_id, dedupe_key, trigger_kind, scheduled_for,
      coalesced_missed_count, automation_revision, execution_snapshot_json,
      status, lease_owner, lease_expires_at, queued_at, bound_at, finished_at,
      conversation_id, run_id, error_code, error_summary
    ) VALUES (?, ?, ?, ?, 'manual', ?, 0, ?, ?, 'skipped', NULL, NULL, ?, NULL, ?, NULL, NULL, 'OVERLAP_SKIPPED', NULL)
  `)
  const advanceAfterClaim = database.prepare(`
    UPDATE automations
    SET status = ?, blocked_reason = NULL, next_run_at = ?, updated_at = ?
    WHERE id = ? AND revision = ? AND status = 'active'
      AND deleted_at IS NULL AND next_run_at = ?
  `)
  const selectLeaseCandidates = database.prepare(`
    SELECT * FROM automation_occurrences
    WHERE deleted_at IS NULL AND status = 'queued' AND run_id IS NULL
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
    ORDER BY scheduled_for, id
    LIMIT ?
  `)
  const acquireLease = database.prepare(`
    UPDATE automation_occurrences
    SET lease_owner = ?, lease_expires_at = ?
    WHERE id = ? AND deleted_at IS NULL AND status = 'queued' AND run_id IS NULL
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
  `)
  const finishQueued = database.prepare(`
    UPDATE automation_occurrences
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
        finished_at = ?, error_code = ?, error_summary = ?
    WHERE id = ? AND deleted_at IS NULL AND status = 'queued' AND run_id IS NULL
      AND (? IS NULL OR lease_owner = ?)
  `)
  const findNonTerminalRun = database.prepare(`
    SELECT 1
    FROM automation_occurrences
    INNER JOIN runs ON runs.id = automation_occurrences.run_id
    WHERE automation_occurrences.automation_id = ?
      AND automation_occurrences.status = 'bound'
      AND runs.status IN ('queued', 'running')
    LIMIT 1
  `)
  const findActiveByProject = database.prepare(`
    SELECT * FROM automations
    WHERE deleted_at IS NULL AND status = 'active' AND project_id = ?
    ORDER BY id
  `)
  const findActiveByPinnedProvider = database.prepare(`
    SELECT * FROM automations
    WHERE deleted_at IS NULL AND status = 'active'
      AND model_mode = 'pinned' AND provider_id = ?
    ORDER BY id
  `)
  const findActiveByPinnedModel = database.prepare(`
    SELECT * FROM automations
    WHERE deleted_at IS NULL AND status = 'active'
      AND model_mode = 'pinned' AND provider_id = ? AND model_id = ?
    ORDER BY id
  `)
  const listDue = database.prepare(`
    SELECT * FROM automations
    WHERE deleted_at IS NULL AND status = 'active' AND next_run_at <= ?
    ORDER BY next_run_at, id
    LIMIT ?
  `)
  const markOccurrenceDeleted = database.prepare(`
    UPDATE automation_occurrences
    SET deleted_at = ?,
        status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
        finished_at = CASE
          WHEN status = 'queued' THEN COALESCE(finished_at, ?)
          ELSE finished_at
        END,
        lease_owner = NULL,
        lease_expires_at = NULL
    WHERE id = ? AND deleted_at IS NULL
  `)

  const replayMutation = <T>(
    mutation: AutomationMutationIdentity,
    schema: ZodType<T>,
  ): T | null => {
    const existing = mutations.find(mutation.requestId)
    if (!existing)
      return null
    if (
      existing.operation !== mutation.operation
      || existing.requestFingerprint !== mutation.fingerprint
    ) {
      throw new AutomationRepositoryError('conflict')
    }
    return schema.parse(existing.response)
  }
  const saveMutation = (
    automationId: string,
    mutation: AutomationMutationIdentity,
    response: unknown,
  ) => {
    mutations.create({
      automationId,
      createdAt: mutation.createdAt,
      operation: mutation.operation,
      requestFingerprint: mutation.fingerprint,
      requestId: mutation.requestId,
      response,
    })
  }

  return {
    bindProjectIfUnassigned(input) {
      if (Number(bindProjectIfUnassigned.run(
        input.projectId,
        input.boundAt,
        input.automationId,
        input.expectedRevision,
      ).changes) !== 1) {
        return null
      }
      return requireAutomation(findAny.get(input.automationId), input.automationId)
    },
    block(input) {
      return withTransaction(database, () => {
        if (Number(blockAutomation.run(
          input.reason,
          input.blockedAt,
          input.automationId,
          input.expectedRevision,
        ).changes) !== 1) {
          return null
        }
        cancelQueued.run(input.blockedAt, input.automationId)
        return requireAutomation(findAny.get(input.automationId), input.automationId)
      })
    },
    blockActiveByPinnedModel(input) {
      const rows = (input.modelId
        ? findActiveByPinnedModel.all(input.providerId, input.modelId)
        : findActiveByPinnedProvider.all(input.providerId)) as unknown as AutomationRow[]
      return blockActiveRows(
        database,
        rows,
        'AUTOMATION_PINNED_MODEL_UNAVAILABLE',
        input.blockedAt,
        blockAutomation,
        cancelQueued,
        findAny,
      )
    },
    blockActiveByProject(input) {
      const rows = findActiveByProject.all(input.projectId) as unknown as AutomationRow[]
      return blockActiveRows(
        database,
        rows,
        'AUTOMATION_PROJECT_UNAVAILABLE',
        input.blockedAt,
        blockAutomation,
        cancelQueued,
        findAny,
      )
    },
    claimScheduled(input) {
      return withTransaction(database, () => {
        const row = findAny.get(input.automationId) as AutomationRow | undefined
        if (
          !row
          || row.deleted_at
          || row.status !== 'active'
          || row.revision !== input.expectedRevision
          || row.next_run_at !== input.expectedNextRunAt
        ) {
          return null
        }
        const snapshot = createExecutionSnapshot(row)
        if (findNonTerminalRun.get(row.id) !== undefined) {
          insertTerminalOccurrence.run(
            input.id,
            row.id,
            `scheduled:${row.id}:${input.scheduledFor}`,
            input.scheduledFor,
            input.coalescedMissedCount,
            row.revision,
            JSON.stringify(snapshot),
            'skipped',
            input.queuedAt,
            input.queuedAt,
            'OVERLAP_SKIPPED',
            null,
          )
          const status = input.nextRunAt ? 'active' : 'completed'
          if (Number(advanceAfterClaim.run(
            status,
            input.nextRunAt,
            input.queuedAt,
            row.id,
            row.revision,
            input.expectedNextRunAt,
          ).changes) !== 1) {
            throw new AutomationRepositoryError('conflict')
          }
          return requireOccurrence(findOccurrence.get(input.id), input.id)
        }
        insertOccurrence.run(
          input.id,
          row.id,
          null,
          `scheduled:${row.id}:${input.scheduledFor}`,
          'scheduled',
          input.scheduledFor,
          input.coalescedMissedCount,
          row.revision,
          JSON.stringify(snapshot),
          input.queuedAt,
        )
        const status = input.nextRunAt ? 'active' : 'completed'
        if (Number(advanceAfterClaim.run(
          status,
          input.nextRunAt,
          input.queuedAt,
          row.id,
          row.revision,
          input.expectedNextRunAt,
        ).changes) !== 1) {
          throw new AutomationRepositoryError('conflict')
        }
        return requireOccurrence(findOccurrence.get(input.id), input.id)
      })
    },
    create(automation, mutation) {
      return withTransaction(database, () => {
        const replay = replayMutation(mutation, automationSchema)
        if (replay)
          return replay
        persistAutomation(insertAutomation, automation)
        const stored = requireAutomation(findAny.get(automation.id), automation.id)
        saveMutation(automation.id, mutation, stored)
        return stored
      })
    },
    createManualOccurrence(input, mutation) {
      return withTransaction(database, () => {
        const replay = replayMutation(mutation, automationOccurrenceSchema)
        if (replay) {
          return requireOccurrence(
            findOccurrence.get(replay.id),
            replay.id,
          )
        }
        const row = findAny.get(input.automationId) as AutomationRow | undefined
        if (!row || row.deleted_at)
          throw new AutomationRepositoryError('not_found')
        if (row.revision !== input.expectedRevision)
          throw new AutomationRepositoryError('conflict')
        const snapshot = createExecutionSnapshot(row)
        if (findNonTerminalRun.get(row.id) !== undefined) {
          insertManualOverlap.run(
            input.id,
            row.id,
            mutation.requestId,
            `manual:${mutation.requestId}`,
            input.scheduledFor,
            row.revision,
            JSON.stringify(snapshot),
            input.queuedAt,
            input.queuedAt,
          )
          const occurrence = requireOccurrence(findOccurrence.get(input.id), input.id)
          saveMutation(row.id, mutation, toPublicOccurrence(occurrence))
          return occurrence
        }
        insertOccurrence.run(
          input.id,
          row.id,
          mutation.requestId,
          `manual:${mutation.requestId}`,
          'manual',
          input.scheduledFor,
          0,
          row.revision,
          JSON.stringify(snapshot),
          input.queuedAt,
        )
        const occurrence = requireOccurrence(findOccurrence.get(input.id), input.id)
        saveMutation(row.id, mutation, toPublicOccurrence(occurrence))
        return occurrence
      })
    },
    findById(id) {
      const row = findVisible.get(id) as AutomationRow | undefined
      return row ? toAutomation(row) : null
    },
    findOccurrenceByConversationId(conversationId) {
      const row = findOccurrenceByConversation.get(conversationId) as AutomationOccurrenceRow | undefined
      return row ? toOccurrence(row) : null
    },
    findOccurrenceById(id) {
      const row = findOccurrence.get(id) as AutomationOccurrenceRow | undefined
      return row ? toOccurrence(row) : null
    },
    finishQueued(input) {
      const owner = input.leaseOwner ?? null
      if (Number(finishQueued.run(
        input.status,
        input.finishedAt,
        input.errorCode,
        input.errorSummary ?? null,
        input.id,
        owner,
        owner,
      ).changes) !== 1) {
        return null
      }
      return requireOccurrence(findOccurrence.get(input.id), input.id)
    },
    finishQueuedAndBlock(input) {
      return withTransaction(database, () => {
        if (Number(finishQueued.run(
          'skipped',
          input.finishedAt,
          input.reason,
          null,
          input.id,
          input.leaseOwner,
          input.leaseOwner,
        ).changes) !== 1) {
          return null
        }
        const blocked = Number(blockAutomation.run(
          input.reason,
          input.finishedAt,
          input.automationId,
          input.expectedRevision,
        ).changes) === 1
        if (blocked)
          cancelQueued.run(input.finishedAt, input.automationId)
        return {
          automation: blocked
            ? requireAutomation(findAny.get(input.automationId), input.automationId)
            : null,
          occurrence: requireOccurrence(findOccurrence.get(input.id), input.id),
        }
      })
    },
    hasNonTerminalRun(automationId) {
      return findNonTerminalRun.get(automationId) !== undefined
    },
    leaseQueued(input) {
      return withTransaction(database, () => {
        const candidates = selectLeaseCandidates.all(
          input.now,
          input.limit,
        ) as unknown as AutomationOccurrenceRow[]
        const leased: AutomationOccurrenceRecord[] = []
        for (const candidate of candidates) {
          if (Number(acquireLease.run(
            input.owner,
            input.leaseExpiresAt,
            candidate.id,
            input.now,
          ).changes) !== 1) {
            continue
          }
          leased.push(requireOccurrence(findOccurrence.get(candidate.id), candidate.id))
        }
        return leased
      })
    },
    list(input) {
      const clauses = ['deleted_at IS NULL']
      const parameters: Array<string | number> = []
      if (input.statuses && input.statuses.length > 0) {
        clauses.push(`status IN (${input.statuses.map(() => '?').join(', ')})`)
        parameters.push(...input.statuses)
      }
      if (input.before) {
        clauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))')
        parameters.push(input.before.occurredAt, input.before.occurredAt, input.before.id)
      }
      const rows = database.prepare(`
        SELECT * FROM automations
        WHERE ${clauses.join(' AND ')}
        ORDER BY updated_at DESC, id DESC
        LIMIT ?
      `).all(...parameters, input.limit + 1) as unknown as AutomationRow[]
      const selected = rows.slice(0, input.limit)
      const last = selected.at(-1)
      return {
        items: selected.map(toAutomation),
        nextCursor: rows.length > input.limit && last
          ? { id: last.id, occurredAt: last.updated_at }
          : null,
      }
    },
    listDue(now, limit) {
      return (listDue.all(now, limit) as unknown as AutomationRow[]).map(toAutomation)
    },
    listHistory(input) {
      const clauses: string[] = ['deleted_at IS NULL']
      const parameters: Array<string | number> = []
      if (input.automationId) {
        clauses.push('automation_id = ?')
        parameters.push(input.automationId)
      }
      if (input.before) {
        clauses.push('(scheduled_for < ? OR (scheduled_for = ? AND id < ?))')
        parameters.push(
          input.before.occurredAt,
          input.before.occurredAt,
          input.before.id,
        )
      }
      const rows = database.prepare(`
        SELECT * FROM automation_occurrences
        WHERE ${clauses.join(' AND ')}
        ORDER BY scheduled_for DESC, id DESC
        LIMIT ?
      `).all(...parameters, input.limit + 1) as unknown as AutomationOccurrenceRow[]
      const selected = rows.slice(0, input.limit)
      const last = selected.at(-1)
      return {
        items: selected.map(toOccurrence),
        nextCursor: rows.length > input.limit && last
          ? { id: last.id, occurredAt: last.scheduled_for }
          : null,
      }
    },
    markOccurrenceDeleted(id, deletedAt) {
      return Number(markOccurrenceDeleted.run(deletedAt, deletedAt, id).changes) === 1
    },
    replayAutomationMutation(mutation) {
      return replayMutation(mutation, automationSchema)
    },
    replayOccurrenceMutation(mutation) {
      const replay = replayMutation(mutation, automationOccurrenceSchema)
      return replay ? requireOccurrence(findOccurrence.get(replay.id), replay.id) : null
    },
    settleScheduled(input) {
      return withTransaction(database, () => {
        const row = findAny.get(input.automationId) as AutomationRow | undefined
        if (
          !row
          || row.deleted_at
          || row.status !== 'active'
          || row.revision !== input.expectedRevision
          || row.next_run_at !== input.expectedNextRunAt
        ) {
          return null
        }
        const snapshot = createExecutionSnapshot(row)
        insertTerminalOccurrence.run(
          input.id,
          row.id,
          `scheduled:${row.id}:${input.scheduledFor}`,
          input.scheduledFor,
          input.coalescedMissedCount,
          row.revision,
          JSON.stringify(snapshot),
          input.status,
          input.finishedAt,
          input.finishedAt,
          input.errorCode,
          input.errorSummary ?? null,
        )
        const status = input.nextRunAt ? 'active' : 'completed'
        if (Number(advanceAfterClaim.run(
          status,
          input.nextRunAt,
          input.finishedAt,
          row.id,
          row.revision,
          input.expectedNextRunAt,
        ).changes) !== 1) {
          throw new AutomationRepositoryError('conflict')
        }
        return requireOccurrence(findOccurrence.get(input.id), input.id)
      })
    },
    replace(input, mutation) {
      return withTransaction(database, () => {
        const replay = replayMutation(mutation, automationSchema)
        if (replay)
          return replay
        const existing = findAny.get(input.automation.id) as AutomationRow | undefined
        if (!existing || existing.deleted_at)
          throw new AutomationRepositoryError('not_found')
        if (existing.revision !== input.expectedRevision)
          throw new AutomationRepositoryError('conflict')
        if (Number(replaceAutomation.run(
          input.automation.name,
          input.automation.prompt,
          input.automation.projectId,
          input.automation.executionProfile,
          input.automation.model.mode,
          input.automation.model.mode === 'pinned' ? input.automation.model.providerId : null,
          input.automation.model.mode === 'pinned' ? input.automation.model.modelId : null,
          input.automation.model.mode === 'pinned' ? input.automation.model.reasoning : null,
          input.automation.timing.schedule.kind,
          JSON.stringify(input.automation.timing.schedule),
          input.automation.timing.timezone,
          input.automation.timing.activeFrom,
          input.automation.timing.activeUntil,
          input.automation.status,
          input.automation.blockedReason,
          input.automation.nextRunAt,
          mutation.operation === 'delete' ? input.automation.updatedAt : null,
          input.automation.revision,
          input.automation.updatedAt,
          input.automation.id,
          input.expectedRevision,
        ).changes) !== 1) {
          throw new AutomationRepositoryError('conflict')
        }
        if (input.cancelQueued)
          cancelQueued.run(input.automation.updatedAt, input.automation.id)
        const stored = requireAutomation(findAny.get(input.automation.id), input.automation.id)
        saveMutation(stored.id, mutation, stored)
        return stored
      })
    },
  }
}

function blockActiveRows(
  database: DatabaseSync,
  rows: AutomationRow[],
  reason: Automation['blockedReason'] & string,
  blockedAt: string,
  blockAutomation: ReturnType<DatabaseSync['prepare']>,
  cancelQueued: ReturnType<DatabaseSync['prepare']>,
  findAny: ReturnType<DatabaseSync['prepare']>,
): Automation[] {
  return withTransaction(database, () => {
    const blocked: Automation[] = []
    for (const row of rows) {
      if (Number(blockAutomation.run(
        reason,
        blockedAt,
        row.id,
        row.revision,
      ).changes) !== 1) {
        continue
      }
      cancelQueued.run(blockedAt, row.id)
      blocked.push(requireAutomation(findAny.get(row.id), row.id))
    }
    return blocked
  })
}

function persistAutomation(
  statement: ReturnType<DatabaseSync['prepare']>,
  automation: Automation,
): void {
  statement.run(
    automation.id,
    automation.name,
    automation.prompt,
    automation.projectId,
    automation.executionProfile,
    automation.model.mode,
    automation.model.mode === 'pinned' ? automation.model.providerId : null,
    automation.model.mode === 'pinned' ? automation.model.modelId : null,
    automation.model.mode === 'pinned' ? automation.model.reasoning : null,
    automation.timing.schedule.kind,
    JSON.stringify(automation.timing.schedule),
    automation.timing.timezone,
    automation.timing.activeFrom,
    automation.timing.activeUntil,
    automation.status,
    automation.blockedReason,
    automation.nextRunAt,
    automation.lastRunAt,
    automation.revision,
    automation.createdAt,
    automation.updatedAt,
  )
}

function requireAutomation(value: unknown, id: string): Automation {
  const row = value as AutomationRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy automation was not persisted: ${id}`)
  return toAutomation(row)
}

function requireOccurrence(value: unknown, id: string): AutomationOccurrenceRecord {
  const row = value as AutomationOccurrenceRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy automation occurrence was not persisted: ${id}`)
  return toOccurrence(row)
}

function toAutomation(row: AutomationRow): Automation {
  return automationSchema.parse({
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    executionProfile: row.execution_profile,
    id: row.id,
    lastRunAt: row.last_run_at,
    model: row.model_mode === 'default'
      ? { mode: 'default' }
      : {
          mode: 'pinned',
          modelId: row.model_id,
          providerId: row.provider_id,
          reasoning: row.reasoning,
        },
    name: row.name,
    nextRunAt: row.next_run_at,
    projectId: row.project_id,
    prompt: row.prompt,
    revision: row.revision,
    status: row.status,
    timing: {
      activeFrom: row.active_from,
      activeUntil: row.active_until,
      schedule: automationScheduleSchema.parse(JSON.parse(row.schedule_json)),
      timezone: row.timezone,
    },
    updatedAt: row.updated_at,
  })
}

function createExecutionSnapshot(row: AutomationRow): AutomationExecutionSnapshot {
  const automation = toAutomation(row)
  return automationExecutionSnapshotSchema.parse({
    executionProfile: automation.executionProfile,
    model: automation.model,
    name: automation.name,
    projectId: automation.projectId,
    prompt: automation.prompt,
    timing: automation.timing,
  })
}

function toOccurrence(row: AutomationOccurrenceRow): AutomationOccurrenceRecord {
  const occurrence = automationOccurrenceSchema.parse({
    automationId: row.automation_id,
    automationRevision: row.automation_revision,
    boundAt: row.bound_at,
    coalescedMissedCount: row.coalesced_missed_count,
    conversationId: row.conversation_id,
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    finishedAt: row.finished_at,
    id: row.id,
    queuedAt: row.queued_at,
    runId: row.run_id,
    scheduledFor: row.scheduled_for,
    status: row.status,
    triggerKind: row.trigger_kind,
  })
  return {
    ...occurrence,
    dedupeKey: row.dedupe_key,
    executionSnapshot: automationExecutionSnapshotSchema.parse(
      JSON.parse(row.execution_snapshot_json),
    ),
    leaseExpiresAt: row.lease_expires_at,
    leaseOwner: row.lease_owner,
    requestId: row.request_id,
  }
}

function toPublicOccurrence(record: AutomationOccurrenceRecord): AutomationOccurrence {
  return automationOccurrenceSchema.parse({
    automationId: record.automationId,
    automationRevision: record.automationRevision,
    boundAt: record.boundAt,
    coalescedMissedCount: record.coalescedMissedCount,
    conversationId: record.conversationId,
    errorCode: record.errorCode,
    errorSummary: record.errorSummary,
    finishedAt: record.finishedAt,
    id: record.id,
    queuedAt: record.queuedAt,
    runId: record.runId,
    scheduledFor: record.scheduledFor,
    status: record.status,
    triggerKind: record.triggerKind,
  })
}
