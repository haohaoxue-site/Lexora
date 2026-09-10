export const BUDDY_V12_TASK_MARKS_SCHEMA_SQL = `
CREATE TABLE task_marks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 20),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 200),
  color TEXT NOT NULL CHECK(length(color) = 7 AND substr(color, 1, 1) = '#'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_attention (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  mark_id TEXT REFERENCES task_marks(id) ON DELETE SET NULL,
  seen_run_id TEXT REFERENCES runs(id),
  forced_unread INTEGER NOT NULL DEFAULT 0 CHECK(forced_unread IN (0, 1)),
  read_revision INTEGER NOT NULL DEFAULT 0 CHECK(read_revision >= 0)
);

CREATE INDEX task_attention_mark ON task_attention(mark_id);
CREATE INDEX runs_task_result ON runs(conversation_id, completed_at DESC)
  WHERE status IN ('completed', 'failed') AND purpose <> 'conversation.compaction';

INSERT INTO task_attention (conversation_id, seen_run_id)
SELECT conversations.id, (
  SELECT runs.id FROM runs
  WHERE runs.conversation_id = conversations.id
    AND runs.status IN ('completed', 'failed') AND runs.purpose <> 'conversation.compaction'
  ORDER BY runs.completed_at DESC, runs.rowid DESC LIMIT 1
)
FROM conversations;
`
