import type { DatabaseSync } from 'node:sqlite'
import type { BuddyThinkingLevel } from '../../../shared/modelSelection'
import type { AutomationOccurrenceRecord } from './automationRepository'
import type { ConversationRecord } from './conversationRepository'
import type { RunRecord } from './runRepository'
import { createAutomationRepository } from './automationRepository'
import { createConversationRepository } from './conversationRepository'
import { withTransaction } from './database'
import { createRunRepository } from './runRepository'

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
  const automations = createAutomationRepository(database)
  const conversations = createConversationRepository(database)
  const runs = createRunRepository(database)
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
      const outcome = withTransaction(database, () => {
        const occurrence = automations.findOccurrenceById(input.occurrenceId)
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
          return 'overlap_skipped' as const
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
        return 'bound' as const
      })
      const occurrence = automations.findOccurrenceById(input.occurrenceId)
      if (!occurrence)
        throw new Error('Lexora Buddy automation occurrence was not persisted')
      if (outcome === 'overlap_skipped')
        return { kind: outcome, occurrence }
      const conversation = conversations.findById(input.conversationId)
      const run = runs.findById(input.runId)
      if (!conversation || !run)
        throw new Error('Lexora Buddy automation turn was not persisted')
      return { conversation, kind: outcome, occurrence, run }
    },
  }
}
