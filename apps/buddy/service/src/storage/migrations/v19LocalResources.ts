export const BUDDY_V19_LOCAL_RESOURCES_SCHEMA_SQL = `
DROP INDEX composer_resources_source;
CREATE INDEX composer_resources_source ON composer_resources(draft_id, source_json) WHERE source_json IS NOT NULL;
`
