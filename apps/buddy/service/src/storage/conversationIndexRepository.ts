import type { DatabaseSync } from 'node:sqlite'
import type { ConversationRecord, ConversationRow } from './conversationRecord'
import { toConversationRecord } from './conversationRecord'

export type ConversationActivity = 'idle' | 'running' | 'awaiting_approval'

export interface ConversationSummaryRecord extends ConversationRecord {
  activity: ConversationActivity
  automationOccurrence: {
    automationId: string
    occurrenceId: string
    scheduledFor: string
  } | null
}

export interface ConversationIndexRepository {
  listRecent: (limit?: number) => ConversationSummaryRecord[]
}

interface ConversationSummaryRow extends ConversationRow {
  activity: ConversationActivity
  automation_id: string | null
  automation_occurrence_id: string | null
  automation_scheduled_for: string | null
}

export function createConversationIndexRepository(
  database: DatabaseSync,
): ConversationIndexRepository {
  const listRecent = database.prepare(`
    SELECT conversations.*,
      automation_occurrences.id AS automation_occurrence_id,
      automation_occurrences.automation_id AS automation_id,
      automation_occurrences.scheduled_for AS automation_scheduled_for,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM runs
          INNER JOIN approvals ON approvals.run_id = runs.id
          WHERE runs.conversation_id = conversations.id
            AND approvals.status = 'pending'
        ) THEN 'awaiting_approval'
        WHEN EXISTS (
          SELECT 1
          FROM runs
          WHERE runs.conversation_id = conversations.id
            AND runs.status IN ('queued', 'running')
        ) THEN 'running'
        ELSE 'idle'
      END AS activity
    FROM conversations
    LEFT JOIN automation_occurrences
      ON automation_occurrences.conversation_id = conversations.id
      AND automation_occurrences.deleted_at IS NULL
    WHERE conversations.deleted_at IS NULL
    ORDER BY conversations.updated_at DESC, conversations.created_at DESC
    LIMIT ?
  `)

  return {
    listRecent(limit = 100) {
      return (listRecent.all(limit) as unknown as ConversationSummaryRow[])
        .map(toConversationSummary)
    },
  }
}

function toConversationSummary(row: ConversationSummaryRow): ConversationSummaryRecord {
  return {
    ...toConversationRecord(row),
    activity: row.activity,
    automationOccurrence: row.automation_occurrence_id
      && row.automation_id
      && row.automation_scheduled_for
      ? {
          automationId: row.automation_id,
          occurrenceId: row.automation_occurrence_id,
          scheduledFor: row.automation_scheduled_for,
        }
      : null,
  }
}
