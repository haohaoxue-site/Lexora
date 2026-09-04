export const BUDDY_V7_ARTIFACT_OUTPUT_SCHEMA_SQL = `
DROP TABLE artifact_changes;
DROP TABLE artifacts;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_artifact_id TEXT REFERENCES artifacts(id),
  current_path TEXT NOT NULL,
  directory_grant_id TEXT NOT NULL,
  directory_root TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'directory')),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (conversation_id, current_path)
);

CREATE INDEX idx_artifacts_conversation
  ON artifacts(conversation_id, updated_at, id);

ALTER TABLE run_file_change_captures RENAME TO run_file_change_captures_v6;

CREATE TABLE run_file_change_captures (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES run_change_sets(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  directory_grant_id TEXT,
  canonical_path TEXT,
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

INSERT INTO run_file_change_captures (
  id, change_set_id, sequence, tool_call_id, tool_name, relative_path,
  directory_grant_id, canonical_path,
  before_kind, before_size_bytes, before_hash, before_snapshot_path,
  before_redacted,
  after_kind, after_size_bytes, after_hash, after_snapshot_path, after_redacted,
  status, tool_reported_error, created_at, completed_at
)
SELECT
  id, change_set_id, sequence, tool_call_id, tool_name, relative_path,
  directory_grant_id, canonical_path,
  before_kind, before_size_bytes, before_hash, before_snapshot_path,
  before_redacted,
  after_kind, after_size_bytes, after_hash, after_snapshot_path, after_redacted,
  status, tool_reported_error, created_at, completed_at
FROM run_file_change_captures_v6;

DROP TABLE run_file_change_captures_v6;

CREATE INDEX idx_run_file_change_captures_set
  ON run_file_change_captures(change_set_id, sequence);
CREATE INDEX idx_run_file_change_captures_tool_call
  ON run_file_change_captures(tool_call_id, status, sequence);
`
