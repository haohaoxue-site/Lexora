export const BUDDY_V3_AUTOMATION_SCHEMA_SQL = `
ALTER TABLE conversations
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'interactive'
    CHECK (origin IN ('interactive', 'automation'));

ALTER TABLE conversations
  ADD COLUMN promoted_at TEXT;

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
`
