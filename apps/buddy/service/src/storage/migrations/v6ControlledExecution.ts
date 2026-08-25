export const BUDDY_V6_CONTROLLED_EXECUTION_SCHEMA_SQL = `
CREATE TABLE conversations_v6 (
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
  promoted_at TEXT
);

INSERT INTO conversations_v6 (
  id, project_id, title, active_branch_id, created_at, updated_at,
  execution_profile, origin, promoted_at
)
SELECT
  id, project_id, title, active_branch_id, created_at, updated_at,
  CASE execution_profile WHEN 'sandboxed' THEN 'controlled' ELSE execution_profile END,
  origin, promoted_at
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_v6 RENAME TO conversations;

CREATE INDEX idx_conversations_updated_at
  ON conversations(updated_at, created_at);

CREATE TABLE runs_v6 (
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

INSERT INTO runs_v6 (
  id, conversation_id, branch_id, triggering_message_id, provider, model,
  purpose, status, pi_session_file, error_code, context_window, max_tokens,
  started_at, completed_at, execution_profile
)
SELECT
  id, conversation_id, branch_id, triggering_message_id, provider, model,
  purpose, status, pi_session_file, error_code, context_window, max_tokens,
  started_at, completed_at,
  CASE execution_profile WHEN 'sandboxed' THEN 'controlled' ELSE execution_profile END
FROM runs;

DROP TABLE runs;
ALTER TABLE runs_v6 RENAME TO runs;

CREATE INDEX idx_runs_conversation_branch
  ON runs(conversation_id, branch_id, started_at);

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

CREATE TABLE automations_v6 (
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

INSERT INTO automations_v6 (
  id, name, prompt, project_id, model_mode, provider_id, model_id, reasoning,
  schedule_kind, schedule_json, timezone, active_from, active_until, status,
  blocked_reason, next_run_at, last_run_at, deleted_at, revision, created_at,
  updated_at, execution_profile
)
SELECT
  id, name, prompt, project_id, model_mode, provider_id, model_id, reasoning,
  schedule_kind, schedule_json, timezone, active_from, active_until, status,
  blocked_reason, next_run_at, last_run_at, deleted_at, revision, created_at,
  updated_at,
  CASE execution_profile WHEN 'sandboxed' THEN 'controlled' ELSE execution_profile END
FROM automations;

DROP TABLE automations;
ALTER TABLE automations_v6 RENAME TO automations;

CREATE INDEX idx_automations_due
  ON automations(status, next_run_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_automations_list
  ON automations(deleted_at, updated_at DESC, id DESC);

UPDATE run_events
SET payload_json = replace(
  payload_json,
  '"executionProfile":"sandboxed"',
  '"executionProfile":"controlled"'
);
UPDATE approvals
SET payload_json = replace(
  payload_json,
  '"executionProfile":"sandboxed"',
  '"executionProfile":"controlled"'
);
UPDATE automation_occurrences
SET execution_snapshot_json = replace(
  execution_snapshot_json,
  '"executionProfile":"sandboxed"',
  '"executionProfile":"controlled"'
);
UPDATE automation_mutation_requests
SET response_json = replace(
  response_json,
  '"executionProfile":"sandboxed"',
  '"executionProfile":"controlled"'
);
UPDATE workspace_settings
SET value_json = replace(
  value_json,
  '"executionProfile":"sandboxed"',
  '"executionProfile":"controlled"'
);
`
