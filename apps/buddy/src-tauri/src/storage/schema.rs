use rusqlite::Connection;

use crate::error::BuddyResult;

pub const CURRENT_SCHEMA_VERSION: i64 = 10;

const CURRENT_SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
  runtime TEXT NOT NULL,
  project_root TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  active_branch_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
  project_root TEXT,
  title TEXT,
  log_path TEXT NOT NULL,
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  forked_from_message_id TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conversation_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES conversation_branches(id) ON DELETE SET NULL,
  forked_from_message_id TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  version_group_id TEXT,
  version_index INTEGER NOT NULL DEFAULT 1,
  version_status TEXT NOT NULL DEFAULT 'active' CHECK (version_status IN ('active', 'superseded')),
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS runtime_bindings (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  runtime TEXT NOT NULL,
  cwd TEXT,
  external_thread_id TEXT,
  external_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  triggering_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  intent TEXT,
  log_path TEXT,
  runtime TEXT NOT NULL,
  cwd TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  external_thread_id TEXT,
  external_run_id TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private', 'portable-insight')),
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_project TEXT,
  source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
  memory_id UNINDEXED,
  content,
  tags,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS embedding_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS embedding_vectors (
  item_id TEXT PRIMARY KEY REFERENCES embedding_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS projects (
  root TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'text', 'binary')),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  source_log_path TEXT NOT NULL,
  source_event_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private')),
  project_id TEXT,
  candidate_type TEXT NOT NULL,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  eligibility_json TEXT NOT NULL DEFAULT '{}',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'ignored', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_source_refs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES memory_candidates(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private')),
  project_id TEXT,
  relative_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  source_log_path TEXT,
  source_event_id TEXT,
  source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(candidate_id),
  CHECK(line_start > 0),
  CHECK(line_end >= line_start)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created_at ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_session_started_at ON runs(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_run_events_run_id_id ON run_events(run_id, id);
CREATE INDEX IF NOT EXISTS idx_memory_items_scope_updated_at ON memory_items(scope, updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_name_root ON projects(name, root);
CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_conversation_id ON conversation_branches(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_branch_created_at ON messages(conversation_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_active ON messages(conversation_id, branch_id, version_status, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_conversation_branch_started_at ON runs(conversation_id, branch_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_bindings_session_runtime_cwd ON runtime_bindings(session_id, runtime, COALESCE(cwd, '')) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_bindings_conversation_branch_runtime_cwd ON runtime_bindings(conversation_id, branch_id, runtime, COALESCE(cwd, '')) WHERE conversation_id IS NOT NULL AND branch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_candidates_source_event_type
  ON memory_candidates(source_event_id, candidate_type)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_candidates_decision_created
  ON memory_candidates(decision, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_run_id
  ON memory_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_scope_project
  ON memory_source_refs(scope, project_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_source_event
  ON memory_source_refs(source_event_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_source_run
  ON memory_source_refs(source_run_id);
"#;

pub(super) fn apply_current_schema(connection: &Connection) -> BuddyResult<()> {
    connection.execute_batch(CURRENT_SCHEMA)?;
    connection.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;

    Ok(())
}

pub(super) fn read_schema_version(connection: &Connection) -> BuddyResult<i64> {
    Ok(connection.pragma_query_value(None, "user_version", |row| row.get(0))?)
}
