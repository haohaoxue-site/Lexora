export const BUDDY_V13_CHAT_QUEUE_SCHEMA_SQL = `
CREATE TABLE chat_queue (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  prepared_json TEXT NOT NULL CHECK (json_valid(prepared_json)),
  state TEXT NOT NULL CHECK (state IN ('waiting', 'paused', 'sent', 'cancelled')),
  run_id TEXT REFERENCES runs(id),
  created_at TEXT NOT NULL
);
CREATE INDEX chat_queue_pending ON chat_queue(conversation_id, branch_id, state, created_at);
`
