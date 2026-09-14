export const BUDDY_V17_SKILLS_SCHEMA_SQL = `
CREATE TABLE skill_installations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  space_id TEXT REFERENCES spaces(id),
  managed_by TEXT NOT NULL CHECK (managed_by IN ('application', 'user', 'external')),
  path TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  origin_json TEXT NOT NULL,
  revision TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(scope_key, name, managed_by)
);
CREATE TABLE skill_space_exclusions (
  skill_id TEXT NOT NULL REFERENCES skill_installations(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  PRIMARY KEY (skill_id, space_id)
);
CREATE TABLE skill_file_cleanup (
  path TEXT PRIMARY KEY,
  space_id TEXT,
  installation_id TEXT NOT NULL
);
`
