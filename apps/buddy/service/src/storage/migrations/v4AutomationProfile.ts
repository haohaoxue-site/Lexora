export const BUDDY_V4_AUTOMATION_PROFILE_SCHEMA_SQL = `
ALTER TABLE automations
  ADD COLUMN execution_profile TEXT NOT NULL DEFAULT 'sandboxed'
    CHECK (execution_profile IN ('sandboxed', 'full_access'));
`
