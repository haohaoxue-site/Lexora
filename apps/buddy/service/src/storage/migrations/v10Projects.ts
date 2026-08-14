export const BUDDY_V10_PROJECTS_SQL = `
ALTER TABLE projects
  ADD COLUMN managed_root TEXT;

ALTER TABLE projects
  ADD COLUMN memory_scope TEXT NOT NULL DEFAULT 'personal_and_project'
  CHECK (memory_scope IN ('personal_and_project', 'project_only'));

ALTER TABLE projects
  ADD COLUMN instructions TEXT NOT NULL DEFAULT '';

ALTER TABLE conversation_deletions
  ADD COLUMN completed_at TEXT;

CREATE UNIQUE INDEX idx_projects_managed_root
  ON projects(managed_root)
  WHERE managed_root IS NOT NULL;

CREATE TABLE project_directory_bindings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  canonical_root TEXT NOT NULL,
  access_granted_at TEXT NOT NULL,
  resources_trusted_at TEXT NOT NULL
);

INSERT INTO project_directory_bindings (
  project_id, root, canonical_root, access_granted_at, resources_trusted_at
)
SELECT
  id,
  root,
  canonical_root,
  access_granted_at,
  COALESCE(resources_trusted_at, access_granted_at)
FROM projects
WHERE revoked_at IS NULL;

CREATE INDEX idx_project_directory_bindings_canonical_root
  ON project_directory_bindings(canonical_root, project_id);

CREATE TABLE project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_project_events_project_created
  ON project_events(project_id, created_at, id);
`
