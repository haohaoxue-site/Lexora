export const BUDDY_V5_ARTIFACT_SCHEMA_SQL = `
ALTER TABLE artifacts RENAME TO artifacts_v4;

DROP INDEX idx_artifacts_conversation;
DROP INDEX idx_artifacts_run;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  last_changed_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_tool_call_id TEXT NOT NULL,
  source_artifact_id TEXT REFERENCES artifacts(id),
  current_path TEXT NOT NULL,
  directory_grant_id TEXT NOT NULL,
  directory_root TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE artifact_changes (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_tool_call_id TEXT NOT NULL,
  change_type TEXT NOT NULL
    CHECK (change_type IN ('created', 'updated', 'deleted', 'renamed')),
  relative_path TEXT NOT NULL,
  previous_relative_path TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO artifacts (
  id, conversation_id, created_run_id, last_changed_run_id,
  source_tool_call_id, source_artifact_id, current_path,
  directory_grant_id, directory_root, relative_path, name,
  mime_type, size_bytes, deleted_at, created_at, updated_at
)
SELECT
  id, conversation_id, run_id, run_id,
  source_tool_call_id, source_artifact_id, stored_path,
  'legacy:' || id, stored_path, name, name,
  mime_type, size_bytes, NULL, created_at, created_at
FROM artifacts_v4;

INSERT INTO artifact_changes (
  id, artifact_id, run_id, source_tool_call_id,
  change_type, relative_path, previous_relative_path, created_at
)
SELECT
  id || ':created', id, run_id, source_tool_call_id,
  'created', name, NULL, created_at
FROM artifacts_v4;

DROP TABLE artifacts_v4;

CREATE INDEX idx_artifacts_conversation
  ON artifacts(conversation_id, updated_at, id);
CREATE UNIQUE INDEX idx_artifacts_current_location
  ON artifacts(conversation_id, directory_grant_id, relative_path)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_artifacts_last_changed_run
  ON artifacts(last_changed_run_id, updated_at, id);
CREATE INDEX idx_artifact_changes_run
  ON artifact_changes(run_id, created_at, id);
CREATE INDEX idx_artifact_changes_artifact
  ON artifact_changes(artifact_id, created_at, id);
`
