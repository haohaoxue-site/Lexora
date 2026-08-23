export const BUDDY_V2_EXECUTION_SCHEMA_SQL = `
ALTER TABLE conversations
  ADD COLUMN execution_profile TEXT NOT NULL DEFAULT 'sandboxed'
  CHECK (execution_profile IN ('sandboxed', 'full_access'));

ALTER TABLE runs
  ADD COLUMN execution_profile TEXT NOT NULL DEFAULT 'sandboxed'
  CHECK (execution_profile IN ('sandboxed', 'full_access'));
`
