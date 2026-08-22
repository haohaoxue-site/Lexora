export const BUDDY_V1_INITIAL_SCHEMA_SQL = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  managed_root TEXT NOT NULL,
  managed_data_deleted_at TEXT,
  memory_scope TEXT NOT NULL
    CHECK (memory_scope IN ('personal_and_project', 'project_only')),
  instructions TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (managed_data_deleted_at IS NULL OR revoked_at IS NOT NULL)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT,
  active_branch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversation_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES conversation_branches(id),
  forked_from_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE conversation_deletions (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  triggering_message_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  pi_session_file TEXT,
  error_code TEXT,
  context_window INTEGER CHECK (context_window > 0),
  max_tokens INTEGER CHECK (max_tokens > 0),
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE run_events (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE turn_requests (
  request_id TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE run_inputs (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  attachment_ids_json TEXT NOT NULL,
  context_items_json TEXT NOT NULL,
  reasoning TEXT,
  service_tier TEXT,
  created_at TEXT NOT NULL
);

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

CREATE TABLE approvals (
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

CREATE TABLE usage_records (
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

CREATE TABLE attachments (
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

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id),
  canonical_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('created', 'edited', 'deleted')),
  mime_type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE workspace_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT CHECK (description IS NULL OR length(description) <= 200),
  api TEXT NOT NULL,
  base_url TEXT NOT NULL,
  models_json TEXT NOT NULL,
  credential_ref TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mcp_servers (
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

CREATE TABLE project_directory_bindings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  canonical_root TEXT NOT NULL,
  access_granted_at TEXT NOT NULL,
  resources_trusted_at TEXT NOT NULL
);

CREATE TABLE project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE provider_states (
  provider_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE provider_model_states (
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  api TEXT NOT NULL,
  input_json TEXT NOT NULL,
  reasoning INTEGER NOT NULL CHECK (reasoning IN (0, 1)),
  cost_json TEXT NOT NULL,
  context_window INTEGER NOT NULL CHECK (context_window > 0),
  max_tokens INTEGER NOT NULL CHECK (max_tokens > 0 AND max_tokens <= context_window),
  override_context_window INTEGER CHECK (override_context_window > 0),
  override_max_tokens INTEGER CHECK (override_max_tokens > 0),
  source_revision TEXT,
  acknowledged_source_revision TEXT,
  source TEXT NOT NULL CHECK (source IN ('builtin', 'manual', 'synced')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  available INTEGER NOT NULL CHECK (available IN (0, 1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, model_id)
);

CREATE TABLE default_model_setting (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  reasoning TEXT
    CHECK (reasoning IS NULL OR reasoning IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_attention_states (
  notification_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL CHECK (origin IN ('local-runtime', 'account', 'platform-public')),
  kind TEXT NOT NULL,
  revision TEXT NOT NULL,
  seen_revision TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE UNIQUE INDEX idx_projects_managed_root
  ON projects(managed_root);
CREATE INDEX idx_conversations_updated_at
  ON conversations(updated_at, created_at);
CREATE INDEX idx_branches_conversation
  ON conversation_branches(conversation_id, created_at);
CREATE INDEX idx_messages_conversation_branch
  ON messages(conversation_id, branch_id, created_at);
CREATE INDEX idx_runs_conversation_branch
  ON runs(conversation_id, branch_id, started_at);
CREATE INDEX idx_command_requests_conversation
  ON command_requests(conversation_id, branch_id, created_at);
CREATE INDEX idx_approvals_run_status
  ON approvals(run_id, status, created_at);
CREATE INDEX idx_usage_run_created
  ON usage_records(run_id, created_at);
CREATE INDEX idx_project_directory_bindings_canonical_root
  ON project_directory_bindings(canonical_root, project_id);
CREATE INDEX idx_project_events_project_created
  ON project_events(project_id, created_at, id);
CREATE INDEX idx_provider_model_states_provider
  ON provider_model_states(provider_id, source, display_name, model_id);
CREATE INDEX idx_notification_attention_retention
  ON notification_attention_states(resolved_at, occurred_at, notification_id);

CREATE TRIGGER provider_model_override_pair_insert
BEFORE INSERT ON provider_model_states
WHEN
  (NEW.override_context_window IS NULL) <> (NEW.override_max_tokens IS NULL)
  OR NEW.override_max_tokens > NEW.override_context_window
BEGIN
  SELECT RAISE(ABORT, 'provider model parameter override must be a valid pair');
END;

CREATE TRIGGER provider_model_override_pair_update
BEFORE UPDATE OF override_context_window, override_max_tokens ON provider_model_states
WHEN
  (NEW.override_context_window IS NULL) <> (NEW.override_max_tokens IS NULL)
  OR NEW.override_max_tokens > NEW.override_context_window
BEGIN
  SELECT RAISE(ABORT, 'provider model parameter override must be a valid pair');
END;

CREATE TRIGGER run_model_parameters_pair_insert
BEFORE INSERT ON runs
WHEN
  (NEW.context_window IS NULL) <> (NEW.max_tokens IS NULL)
  OR NEW.max_tokens > NEW.context_window
BEGIN
  SELECT RAISE(ABORT, 'run model parameters must be a valid pair');
END;

CREATE TRIGGER run_model_parameters_pair_update
BEFORE UPDATE OF context_window, max_tokens ON runs
WHEN
  (NEW.context_window IS NULL) <> (NEW.max_tokens IS NULL)
  OR NEW.max_tokens > NEW.context_window
BEGIN
  SELECT RAISE(ABORT, 'run model parameters must be a valid pair');
END;
`
