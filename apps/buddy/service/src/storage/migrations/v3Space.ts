export const BUDDY_V3_SPACE_SCHEMA_SQL = `
DROP INDEX idx_project_directory_bindings_canonical_root;
DROP INDEX idx_project_events_project_created;

ALTER TABLE projects RENAME TO spaces;
ALTER TABLE conversations RENAME COLUMN project_id TO space_id;
ALTER TABLE automations RENAME COLUMN project_id TO space_id;
ALTER TABLE project_events RENAME TO space_events;
ALTER TABLE space_events RENAME COLUMN project_id TO space_id;

ALTER TABLE project_directory_bindings RENAME TO legacy_space_directory_bindings;

CREATE TABLE space_directory_bindings (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  canonical_root TEXT NOT NULL,
  access_granted_at TEXT NOT NULL,
  resources_trusted_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (is_primary = 1 OR resources_trusted_at IS NULL)
);

INSERT INTO space_directory_bindings (
  id, space_id, root, canonical_root, access_granted_at,
  resources_trusted_at, is_primary, revision, revoked_at, created_at, updated_at
)
SELECT
  project_id, project_id, root, canonical_root, access_granted_at,
  resources_trusted_at, 1, 1, NULL, access_granted_at, access_granted_at
FROM legacy_space_directory_bindings;

DROP TABLE legacy_space_directory_bindings;

CREATE UNIQUE INDEX idx_space_directory_bindings_active_root
  ON space_directory_bindings(space_id, canonical_root)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_space_directory_bindings_primary
  ON space_directory_bindings(space_id)
  WHERE is_primary = 1 AND revoked_at IS NULL;
CREATE INDEX idx_space_directory_bindings_canonical_root
  ON space_directory_bindings(canonical_root, space_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_space_events_space_created
  ON space_events(space_id, created_at, id);

ALTER TABLE runs ADD COLUMN execution_context_json TEXT
  CHECK (execution_context_json IS NULL OR json_valid(execution_context_json));

UPDATE automation_occurrences
SET execution_snapshot_json = json_remove(
  json_set(
    execution_snapshot_json,
    '$.spaceId', json_extract(execution_snapshot_json, '$.projectId'),
    '$.spaceContext', NULL
  ),
  '$.projectId'
);

UPDATE automation_mutation_requests
SET response_json = json_remove(
  json_set(response_json, '$.spaceId', json_extract(response_json, '$.projectId')),
  '$.projectId'
)
WHERE json_type(response_json, '$.projectId') IS NOT NULL;

UPDATE approvals
SET payload_json = json_remove(
  json_set(payload_json, '$.spaceId', json_extract(payload_json, '$.projectId')),
  '$.projectId'
)
WHERE kind = 'automation' AND json_type(payload_json, '$.projectId') IS NOT NULL;

UPDATE run_events
SET payload_json = json_remove(
  json_set(
    payload_json,
    '$.payload.spaceId', json_extract(payload_json, '$.payload.projectId')
  ),
  '$.payload.projectId'
)
WHERE event_type = 'approval.requested'
  AND json_extract(payload_json, '$.kind') = 'automation'
  AND json_type(payload_json, '$.payload.projectId') IS NOT NULL;

UPDATE space_events
SET event_type = CASE event_type
  WHEN 'project.config.updated' THEN 'space.config.updated'
  WHEN 'project.deleted' THEN 'space.deleted'
  ELSE event_type
END;

ALTER TABLE run_file_change_captures ADD COLUMN directory_grant_id TEXT;
ALTER TABLE run_file_change_captures ADD COLUMN canonical_path TEXT;
`
