export const BUDDY_V5_AUTOMATION_HISTORY_SCHEMA_SQL = `
ALTER TABLE automation_occurrences
  ADD COLUMN deleted_at TEXT;

CREATE UNIQUE INDEX idx_automation_occurrences_conversation
  ON automation_occurrences(conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX idx_automation_occurrences_visible_history
  ON automation_occurrences(deleted_at, scheduled_for DESC, id DESC);
`
