import type { DatabaseSync } from 'node:sqlite'
import type { BuddyThinkingLevel } from '../../../shared/modelSelection'
import type {
  AutomationOccurrenceRecord,
  AutomationOccurrenceRow,
} from './automationOccurrenceRecord'
import type { ConversationRecord } from './conversationRecord'
import type { RunRecord } from './runRecord'
import {
  requireAutomationOccurrenceRecord,
  toAutomationOccurrenceRecord,
} from './automationOccurrenceRecord'
import { requireConversationRecord } from './conversationRecord'
import { withTransaction } from './database'
import { requireRunRecord } from './runRecord'

export interface BindAutomationTurnInput {
  boundAt: string
  branchId: string
  contextWindow: number | null
  conversationId: string
  leaseOwner: string
  maxTokens: number | null
  messageId: string
  model: string
  occurrenceId: string
  projectId: string | null
  provider: string
  reasoning: BuddyThinkingLevel | null
  runId: string
}

export interface BoundAutomationTurn {
  conversation: ConversationRecord
  kind: 'bound'
  occurrence: AutomationOccurrenceRecord
  run: RunRecord
}

export interface SkippedAutomationTurn {
  kind: 'overlap_skipped'
  occurrence: AutomationOccurrenceRecord
}

export interface AutomationTurnRepository {
  bind: (input: BindAutomationTurnInput) => BoundAutomationTurn | SkippedAutomationTurn
}

export class AutomationTurnBindingError extends Error {
  constructor() {
    super('Lexora Buddy automation occurrence lease cannot be bound')
    this.name = 'AutomationTurnBindingError'
  }
}

export function createAutomationTurnRepository(database: DatabaseSync): AutomationTurnRepository {
  const findOccurrence = database.prepare(`
    SELECT * FROM automation_occurrences WHERE id = ? AND deleted_at IS NULL
  `)
  const findConversation = database.prepare('SELECT * FROM conversations WHERE id = ?')
  const findRun = database.prepare('SELECT * FROM runs WHERE id = ?')
  const insertConversation = database.prepare(`
    INSERT INTO conversations (
      id, project_id, title, active_branch_id, created_at, updated_at,
      execution_profile, origin, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'automation', NULL)
  `)
  const insertBranch = database.prepare(`
    INSERT INTO conversation_branches (
      id, conversation_id, parent_branch_id, forked_from_message_id, created_at
    ) VALUES (?, ?, NULL, NULL, ?)
  `)
  const insertMessage = database.prepare(`
    INSERT INTO messages (
      id, conversation_id, branch_id, run_id, role, content_json, created_at
    ) VALUES (?, ?, ?, NULL, 'user', ?, ?)
  `)
  const insertRun = database.prepare(`
    INSERT INTO runs (
      id, conversation_id, branch_id, triggering_message_id, provider, model,
      context_window, max_tokens, purpose, status, pi_session_file, error_code,
      started_at, completed_at, execution_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'automation', 'queued', NULL, NULL, ?, NULL, ?)
  `)
  const insertRunInput = database.prepare(`
    INSERT INTO run_inputs (
      run_id, prompt, attachment_ids_json, context_items_json,
      reasoning, service_tier, created_at
    ) VALUES (?, ?, '[]', '[]', ?, NULL, ?)
  `)
  const bindOccurrence = database.prepare(`
    UPDATE automation_occurrences
    SET status = 'bound', lease_owner = NULL, lease_expires_at = NULL,
        bound_at = ?, conversation_id = ?, run_id = ?
    WHERE id = ? AND deleted_at IS NULL AND status = 'queued' AND run_id IS NULL
      AND lease_owner = ? AND lease_expires_at >= ?
  `)
  const updateLastRun = database.prepare(`
    UPDATE automations SET last_run_at = ?, updated_at = ? WHERE id = ?
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
  const skipOverlap = database.prepare(`
    UPDATE automation_occurrences
    SET status = 'skipped', lease_owner = NULL, lease_expires_at = NULL,
        finished_at = ?, error_code = 'OVERLAP_SKIPPED', error_summary = NULL
    WHERE id = ? AND status = 'queued' AND run_id IS NULL
      AND lease_owner = ? AND lease_expires_at >= ?
  `)

  return {
    bind(input) {
      return withTransaction(database, () => {
        const occurrence = findOccurrenceRecord(input.occurrenceId)
        if (
          !occurrence
          || occurrence.status !== 'queued'
          || occurrence.runId
          || occurrence.leaseOwner !== input.leaseOwner
          || !occurrence.leaseExpiresAt
          || occurrence.leaseExpiresAt < input.boundAt
        ) {
          throw new AutomationTurnBindingError()
        }
        if (findNonTerminalRun.get(occurrence.automationId) !== undefined) {
          if (Number(skipOverlap.run(
            input.boundAt,
            occurrence.id,
            input.leaseOwner,
            input.boundAt,
          ).changes) !== 1) {
            throw new AutomationTurnBindingError()
          }
          return {
            kind: 'overlap_skipped',
            occurrence: requireOccurrenceRecord(occurrence.id),
          }
        }
        const snapshot = occurrence.executionSnapshot
        insertConversation.run(
          input.conversationId,
          input.projectId,
          snapshot.name,
          input.branchId,
          input.boundAt,
          input.boundAt,
          snapshot.executionProfile,
        )
        insertBranch.run(input.branchId, input.conversationId, input.boundAt)
        insertMessage.run(
          input.messageId,
          input.conversationId,
          input.branchId,
          JSON.stringify({
            automationId: occurrence.automationId,
            automationRevision: occurrence.automationRevision,
            occurrenceId: occurrence.id,
            text: snapshot.prompt,
          }),
          input.boundAt,
        )
        insertRun.run(
          input.runId,
          input.conversationId,
          input.branchId,
          input.messageId,
          input.provider,
          input.model,
          input.contextWindow,
          input.maxTokens,
          input.boundAt,
          snapshot.executionProfile,
        )
        insertRunInput.run(input.runId, snapshot.prompt, input.reasoning, input.boundAt)
        if (Number(bindOccurrence.run(
          input.boundAt,
          input.conversationId,
          input.runId,
          occurrence.id,
          input.leaseOwner,
          input.boundAt,
        ).changes) !== 1) {
          throw new AutomationTurnBindingError()
        }
        updateLastRun.run(input.boundAt, input.boundAt, occurrence.automationId)
        return {
          conversation: requireConversationRecord(
            findConversation.get(input.conversationId),
            input.conversationId,
          ),
          kind: 'bound',
          occurrence: requireOccurrenceRecord(occurrence.id),
          run: requireRunRecord(findRun.get(input.runId), input.runId),
        }
      })
    },
  }

  function findOccurrenceRecord(id: string): AutomationOccurrenceRecord | null {
    const row = findOccurrence.get(id) as AutomationOccurrenceRow | undefined
    return row ? toAutomationOccurrenceRecord(row) : null
  }

  function requireOccurrenceRecord(id: string): AutomationOccurrenceRecord {
    return requireAutomationOccurrenceRecord(findOccurrence.get(id), id)
  }
}
