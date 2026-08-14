export const BUDDY_V7_COMMAND_REQUESTS_SQL = `
CREATE TABLE command_requests (
  request_id TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (command IN ('compact')),
  arguments TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_command_requests_conversation
  ON command_requests(conversation_id, branch_id, created_at);
`
