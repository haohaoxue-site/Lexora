export const BUDDY_V6_PERMISSION_SCHEMA_SQL = `
CREATE TABLE spaces_v6 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  memory_scope TEXT NOT NULL
    CHECK (memory_scope IN ('personal_and_space', 'space_only')),
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO spaces_v6 (
  id, name, memory_scope, revoked_at, created_at, updated_at
)
SELECT
  id,
  name,
  CASE memory_scope
    WHEN 'personal_and_project' THEN 'personal_and_space'
    WHEN 'project_only' THEN 'space_only'
    ELSE memory_scope
  END,
  revoked_at,
  created_at,
  updated_at
FROM spaces;

DROP TABLE spaces;
ALTER TABLE spaces_v6 RENAME TO spaces;

CREATE TABLE conversations_v6 (
  id TEXT PRIMARY KEY,
  space_id TEXT REFERENCES spaces(id),
  title TEXT,
  active_branch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approval_policy TEXT NOT NULL DEFAULT 'policy'
    CHECK (approval_policy IN ('manual', 'policy')),
  execution_profile TEXT NOT NULL DEFAULT 'workspace_write'
    CHECK (execution_profile IN ('read_only', 'workspace_write', 'full_access')),
  origin TEXT NOT NULL DEFAULT 'interactive'
    CHECK (origin IN ('interactive', 'automation')),
  deleted_at TEXT,
  model_selection_json TEXT
    CHECK (model_selection_json IS NULL OR json_valid(model_selection_json))
);

INSERT INTO conversations_v6 (
  id, space_id, title, active_branch_id, created_at, updated_at,
  approval_policy, execution_profile, origin, deleted_at, model_selection_json
)
SELECT
  id, space_id, title, active_branch_id, created_at, updated_at,
  'policy',
  CASE execution_profile
    WHEN 'controlled' THEN 'workspace_write'
    ELSE execution_profile
  END,
  origin, deleted_at, model_selection_json
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_v6 RENAME TO conversations;

CREATE INDEX idx_conversations_updated_at
  ON conversations(updated_at, created_at);
CREATE INDEX idx_conversations_visible_updated_at
  ON conversations(deleted_at, updated_at DESC, created_at DESC);

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
  approval_policy TEXT NOT NULL DEFAULT 'policy'
    CHECK (approval_policy IN ('manual', 'policy')),
  execution_profile TEXT NOT NULL DEFAULT 'workspace_write'
    CHECK (execution_profile IN ('read_only', 'workspace_write', 'full_access')),
  execution_context_json TEXT
    CHECK (execution_context_json IS NULL OR json_valid(execution_context_json))
);

INSERT INTO runs_v6 (
  id, conversation_id, branch_id, triggering_message_id, provider, model,
  purpose, status, pi_session_file, error_code, context_window, max_tokens,
  started_at, completed_at, approval_policy, execution_profile, execution_context_json
)
SELECT
  id, conversation_id, branch_id, triggering_message_id, provider, model,
  purpose, status, pi_session_file, error_code, context_window, max_tokens,
  started_at, completed_at,
  'policy',
  CASE execution_profile
    WHEN 'controlled' THEN 'workspace_write'
    ELSE execution_profile
  END,
  execution_context_json
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
  space_id TEXT REFERENCES spaces(id),
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
      'AUTOMATION_SPACE_UNAVAILABLE',
      'AUTOMATION_PINNED_MODEL_UNAVAILABLE'
    )),
  next_run_at TEXT,
  last_run_at TEXT,
  deleted_at TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_profile TEXT NOT NULL DEFAULT 'workspace_write'
    CHECK (execution_profile IN ('read_only', 'workspace_write', 'full_access')),
  CHECK (
    (model_mode = 'default' AND provider_id IS NULL AND model_id IS NULL AND reasoning IS NULL)
    OR (model_mode = 'pinned' AND provider_id IS NOT NULL AND model_id IS NOT NULL)
  ),
  CHECK ((status = 'blocked') = (blocked_reason IS NOT NULL)),
  CHECK ((status = 'active') = (next_run_at IS NOT NULL)),
  CHECK (active_from IS NULL OR active_until IS NULL OR active_from <= active_until)
);

INSERT INTO automations_v6 (
  id, name, prompt, space_id, model_mode, provider_id, model_id, reasoning,
  schedule_kind, schedule_json, timezone, active_from, active_until, status,
  blocked_reason,
  next_run_at, last_run_at, deleted_at, revision, created_at,
  updated_at, execution_profile
)
SELECT
  id, name, prompt, space_id, model_mode, provider_id, model_id, reasoning,
  schedule_kind, schedule_json, timezone, active_from, active_until, status,
  CASE blocked_reason
    WHEN 'AUTOMATION_PROJECT_UNAVAILABLE' THEN 'AUTOMATION_SPACE_UNAVAILABLE'
    ELSE blocked_reason
  END,
  next_run_at, last_run_at, deleted_at, revision, created_at,
  updated_at,
  CASE execution_profile
    WHEN 'controlled' THEN 'workspace_write'
    ELSE execution_profile
  END
FROM automations;

DROP TABLE automations;
ALTER TABLE automations_v6 RENAME TO automations;

CREATE INDEX idx_automations_due
  ON automations(status, next_run_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_automations_list
  ON automations(deleted_at, updated_at DESC, id DESC);

UPDATE automation_occurrences
SET execution_snapshot_json = json_set(
  execution_snapshot_json,
  '$.executionProfile',
  'workspace_write'
)
WHERE json_extract(execution_snapshot_json, '$.executionProfile') = 'controlled';

UPDATE workspace_settings
SET value_json = json_set(
  value_json,
  '$.drafts',
  json((
    SELECT json_group_array(
      json_set(
        json(value),
        '$.approvalPolicy',
        'policy',
        '$.executionProfile',
        CASE json_extract(value, '$.executionProfile')
          WHEN 'controlled' THEN 'workspace_write'
          ELSE json_extract(value, '$.executionProfile')
        END
      )
    )
    FROM json_each(workspace_settings.value_json, '$.drafts')
  ))
)
WHERE key = 'buddy.chat.workspace.v2'
  AND json_valid(value_json)
  AND json_type(value_json, '$.drafts') = 'array';

CREATE TABLE conversation_directory_grants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  canonical_root TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_conversation_directory_grants_active_root
  ON conversation_directory_grants(conversation_id, canonical_root)
  WHERE revoked_at IS NULL;
`
