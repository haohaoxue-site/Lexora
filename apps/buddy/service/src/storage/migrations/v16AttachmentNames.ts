export const BUDDY_V16_ATTACHMENT_NAMES_SCHEMA_SQL = `
ALTER TABLE composer_resources ADD COLUMN name_source TEXT NOT NULL DEFAULT 'file' CHECK (name_source IN ('file', 'clipboard'));
ALTER TABLE attachments ADD COLUMN name_source TEXT NOT NULL DEFAULT 'file' CHECK (name_source IN ('file', 'clipboard'));
ALTER TABLE composer_resources ADD COLUMN source_path TEXT;
ALTER TABLE attachments ADD COLUMN source_path TEXT;
`
