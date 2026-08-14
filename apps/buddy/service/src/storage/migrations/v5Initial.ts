export const BUDDY_V5_INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  root TEXT NOT NULL UNIQUE,
  canonical_root TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  access_granted_at TEXT NOT NULL,
  resources_trusted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT,
  active_branch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES conversation_branches(id),
  forked_from_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_deletions (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  triggering_message_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  pi_session_file TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS turn_requests (
  request_id TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_entry_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER,
  total_tokens INTEGER NOT NULL,
  input_cost REAL NOT NULL,
  output_cost REAL NOT NULL,
  cache_read_cost REAL NOT NULL,
  cache_write_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, source_entry_id, purpose)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  draft_key TEXT,
  stored_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'attached', 'released')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id),
  canonical_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('created', 'edited', 'deleted')),
  mime_type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api TEXT NOT NULL,
  base_url TEXT NOT NULL,
  models_json TEXT NOT NULL,
  credential_ref TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'streamable-http')),
  command TEXT,
  args_json TEXT,
  cwd TEXT,
  url TEXT,
  credential_ref TEXT,
  trusted_at TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at, created_at);
CREATE INDEX IF NOT EXISTS idx_branches_conversation
  ON conversation_branches(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_branch
  ON messages(conversation_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_conversation_branch
  ON runs(conversation_id, branch_id, started_at);
CREATE INDEX IF NOT EXISTS idx_approvals_run_status
  ON approvals(run_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_run_created
  ON usage_records(run_id, created_at);
`
