export const BUDDY_V12_MODEL_ATTENTION_SQL = `
ALTER TABLE provider_model_states
  ADD COLUMN override_context_window INTEGER CHECK (override_context_window > 0);
ALTER TABLE provider_model_states
  ADD COLUMN override_max_tokens INTEGER CHECK (override_max_tokens > 0);
ALTER TABLE provider_model_states
  ADD COLUMN source_revision TEXT;
ALTER TABLE provider_model_states
  ADD COLUMN acknowledged_source_revision TEXT;

UPDATE provider_model_states
SET source_revision = updated_at
WHERE source_revision IS NULL;

ALTER TABLE runs
  ADD COLUMN context_window INTEGER CHECK (context_window > 0);
ALTER TABLE runs
  ADD COLUMN max_tokens INTEGER CHECK (max_tokens > 0);

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
