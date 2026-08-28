export const BUDDY_V2_CHANGE_SCHEMA_SQL = `
CREATE TABLE run_change_sets (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  coverage TEXT NOT NULL CHECK (coverage IN ('complete', 'partial')),
  status TEXT NOT NULL CHECK (status IN ('capturing', 'completed')),
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE run_file_change_captures (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES run_change_sets(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  tool_call_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL CHECK (tool_name IN ('edit', 'write')),
  relative_path TEXT NOT NULL,
  before_kind TEXT NOT NULL CHECK (
    before_kind IN ('missing', 'text', 'binary', 'oversized', 'sensitive', 'unavailable')
  ),
  before_size_bytes INTEGER CHECK (before_size_bytes IS NULL OR before_size_bytes >= 0),
  before_hash TEXT,
  before_redacted INTEGER NOT NULL DEFAULT 0 CHECK (before_redacted IN (0, 1)),
  before_snapshot_path TEXT,
  after_kind TEXT CHECK (
    after_kind IS NULL OR after_kind IN (
      'missing', 'text', 'binary', 'oversized', 'sensitive', 'unavailable'
    )
  ),
  after_size_bytes INTEGER CHECK (after_size_bytes IS NULL OR after_size_bytes >= 0),
  after_hash TEXT,
  after_redacted INTEGER CHECK (after_redacted IS NULL OR after_redacted IN (0, 1)),
  after_snapshot_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  tool_reported_error INTEGER CHECK (tool_reported_error IS NULL OR tool_reported_error IN (0, 1)),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (change_set_id, sequence)
);

CREATE INDEX idx_run_change_sets_conversation
  ON run_change_sets(conversation_id, updated_at, id);
CREATE INDEX idx_run_file_change_captures_set
  ON run_file_change_captures(change_set_id, sequence);
`
