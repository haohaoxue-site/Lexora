export const BUDDY_V4_SPACE_SCHEMA_SQL = `
UPDATE space_directory_bindings
SET resources_trusted_at = COALESCE(resources_trusted_at, access_granted_at),
    revision = revision + 1
WHERE is_primary = 1 AND revoked_at IS NULL AND resources_trusted_at IS NULL;

ALTER TABLE spaces DROP COLUMN instructions;
`
