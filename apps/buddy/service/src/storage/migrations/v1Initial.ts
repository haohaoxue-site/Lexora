export const BUDDY_V1_INITIAL_SCHEMA_SQL = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  memory_scope TEXT NOT NULL
    CHECK (memory_scope IN ('personal_and_project', 'project_only')),
  instructions TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT,
  active_branch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_profile TEXT NOT NULL DEFAULT 'controlled'
    CHECK (execution_profile IN ('controlled', 'full_access')),
  origin TEXT NOT NULL DEFAULT 'interactive'
    CHECK (origin IN ('interactive', 'automation')),
  deleted_at TEXT,
  model_selection_json TEXT
    CHECK (model_selection_json IS NULL OR json_valid(model_selection_json))
);

CREATE TABLE conversation_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES conversation_branches(id),
  forked_from_message_id TEXT,
  created_at TEXT NOT NULL
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
  completed_at TEXT,
  execution_profile TEXT NOT NULL DEFAULT 'controlled'
    CHECK (execution_profile IN ('controlled', 'full_access'))
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
  draft_id TEXT,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  stored_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((draft_id IS NULL) <> (message_id IS NULL))
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_tool_call_id TEXT NOT NULL,
  source_artifact_id TEXT REFERENCES artifacts(id),
  stored_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
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

CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  prompt TEXT NOT NULL CHECK (length(prompt) > 0),
  project_id TEXT REFERENCES projects(id),
  model_mode TEXT NOT NULL CHECK (model_mode IN ('default', 'pinned')),
  provider_id TEXT,
  model_id TEXT,
  reasoning TEXT
    CHECK (reasoning IS NULL OR reasoning IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('calendar', 'interval', 'once')),
  schedule_json TEXT NOT NULL,
  timezone TEXT NOT NULL,
  active_from TEXT,
  active_until TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'blocked', 'completed')),
  blocked_reason TEXT
    CHECK (blocked_reason IS NULL OR blocked_reason IN (
      'AUTOMATION_PROJECT_UNAVAILABLE',
      'AUTOMATION_PINNED_MODEL_UNAVAILABLE'
    )),
  next_run_at TEXT,
  last_run_at TEXT,
  deleted_at TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_profile TEXT NOT NULL DEFAULT 'controlled'
    CHECK (execution_profile IN ('controlled', 'full_access')),
  CHECK (
    (model_mode = 'default' AND provider_id IS NULL AND model_id IS NULL AND reasoning IS NULL)
    OR (model_mode = 'pinned' AND provider_id IS NOT NULL AND model_id IS NOT NULL)
  ),
  CHECK ((status = 'blocked') = (blocked_reason IS NOT NULL)),
  CHECK ((status = 'active') = (next_run_at IS NOT NULL)),
  CHECK (active_from IS NULL OR active_until IS NULL OR active_from <= active_until)
);

CREATE TABLE automation_occurrences (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  request_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('scheduled', 'manual')),
  scheduled_for TEXT NOT NULL,
  coalesced_missed_count INTEGER NOT NULL DEFAULT 0 CHECK (coalesced_missed_count >= 0),
  automation_revision INTEGER NOT NULL CHECK (automation_revision > 0),
  execution_snapshot_json TEXT NOT NULL CHECK (length(execution_snapshot_json) <= 49152),
  status TEXT NOT NULL CHECK (status IN ('queued', 'bound', 'skipped', 'expired', 'cancelled')),
  lease_owner TEXT,
  lease_expires_at TEXT,
  queued_at TEXT NOT NULL,
  bound_at TEXT,
  finished_at TEXT,
  conversation_id TEXT REFERENCES conversations(id),
  run_id TEXT UNIQUE REFERENCES runs(id),
  error_code TEXT,
  error_summary TEXT CHECK (error_summary IS NULL OR length(error_summary) <= 512),
  deleted_at TEXT,
  CHECK (
    (trigger_kind = 'scheduled' AND request_id IS NULL)
    OR (trigger_kind = 'manual' AND request_id IS NOT NULL)
  ),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK (
    status <> 'bound'
    OR (conversation_id IS NOT NULL AND run_id IS NOT NULL AND bound_at IS NOT NULL)
  )
);

CREATE TABLE automation_mutation_requests (
  request_id TEXT PRIMARY KEY,
  operation TEXT NOT NULL
    CHECK (operation IN ('create', 'update', 'pause', 'resume', 'delete', 'run_now')),
  request_fingerprint TEXT NOT NULL,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  response_json TEXT NOT NULL CHECK (length(response_json) <= 65536),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_conversations_updated_at
  ON conversations(updated_at, created_at);
CREATE INDEX idx_conversations_visible_updated_at
  ON conversations(deleted_at, updated_at DESC, created_at DESC);
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
CREATE INDEX idx_attachments_draft
  ON attachments(draft_id, created_at, id)
  WHERE draft_id IS NOT NULL;
CREATE INDEX idx_attachments_message
  ON attachments(message_id, created_at, id)
  WHERE message_id IS NOT NULL;
CREATE INDEX idx_artifacts_conversation
  ON artifacts(conversation_id, created_at, id);
CREATE INDEX idx_artifacts_run
  ON artifacts(run_id, created_at, id);
CREATE INDEX idx_project_directory_bindings_canonical_root
  ON project_directory_bindings(canonical_root, project_id);
CREATE INDEX idx_project_events_project_created
  ON project_events(project_id, created_at, id);
CREATE INDEX idx_provider_model_states_provider
  ON provider_model_states(provider_id, source, display_name, model_id);
CREATE INDEX idx_notification_attention_retention
  ON notification_attention_states(resolved_at, occurred_at, notification_id);
CREATE INDEX idx_automations_due
  ON automations(status, next_run_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_automations_list
  ON automations(deleted_at, updated_at DESC, id DESC);
CREATE UNIQUE INDEX idx_automation_occurrences_scheduled
  ON automation_occurrences(automation_id, scheduled_for)
  WHERE trigger_kind = 'scheduled';
CREATE UNIQUE INDEX idx_automation_occurrences_manual_request
  ON automation_occurrences(request_id)
  WHERE trigger_kind = 'manual';
CREATE INDEX idx_automation_occurrences_queue
  ON automation_occurrences(status, scheduled_for, id);
CREATE INDEX idx_automation_occurrences_history
  ON automation_occurrences(automation_id, scheduled_for DESC, id DESC);
CREATE INDEX idx_automation_mutation_requests_automation
  ON automation_mutation_requests(automation_id, created_at, request_id);
CREATE UNIQUE INDEX idx_automation_occurrences_conversation
  ON automation_occurrences(conversation_id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_automation_occurrences_visible_history
  ON automation_occurrences(deleted_at, scheduled_for DESC, id DESC);

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
