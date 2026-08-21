export const BUDDY_V11_PROVIDERS_SQL = `
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
  source TEXT NOT NULL CHECK (source IN ('builtin', 'manual', 'synced')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  available INTEGER NOT NULL CHECK (available IN (0, 1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, model_id)
);

CREATE INDEX idx_provider_model_states_provider
  ON provider_model_states(provider_id, source, display_name, model_id);

CREATE TABLE default_model_setting (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
