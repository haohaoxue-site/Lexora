export const BUDDY_V9_COMPOSER_SCHEMA_SQL = `
CREATE TABLE composer_drafts (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global', 'space', 'conversation_branch', 'message_edit')),
  space_id TEXT REFERENCES spaces(id),
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  source_message_id TEXT REFERENCES messages(id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  model_selection_json TEXT CHECK (model_selection_json IS NULL OR json_valid(model_selection_json)),
  approval_policy TEXT NOT NULL CHECK (approval_policy IN ('manual', 'policy')),
  execution_profile TEXT NOT NULL CHECK (execution_profile IN ('read_only', 'workspace_write', 'full_access')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (scope_kind = 'global' AND space_id IS NULL AND conversation_id IS NULL AND branch_id IS NULL AND source_message_id IS NULL)
    OR (scope_kind = 'space' AND space_id IS NOT NULL AND conversation_id IS NULL AND branch_id IS NULL AND source_message_id IS NULL)
    OR (scope_kind = 'conversation_branch' AND space_id IS NULL AND conversation_id IS NOT NULL AND branch_id IS NOT NULL AND source_message_id IS NULL)
    OR (scope_kind = 'message_edit' AND space_id IS NULL AND conversation_id IS NOT NULL AND branch_id IS NOT NULL AND source_message_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX composer_drafts_global_scope ON composer_drafts(scope_kind) WHERE scope_kind = 'global';
CREATE UNIQUE INDEX composer_drafts_space_scope ON composer_drafts(space_id) WHERE scope_kind = 'space';
CREATE UNIQUE INDEX composer_drafts_branch_scope ON composer_drafts(conversation_id, branch_id) WHERE scope_kind = 'conversation_branch';
CREATE UNIQUE INDEX composer_drafts_message_edit_scope ON composer_drafts(conversation_id, branch_id, source_message_id) WHERE scope_kind = 'message_edit';

ALTER TABLE turn_requests ADD COLUMN draft_id TEXT REFERENCES composer_drafts(id);
ALTER TABLE turn_requests ADD COLUMN draft_revision INTEGER CHECK (draft_revision IS NULL OR draft_revision >= 0);
ALTER TABLE turn_requests ADD COLUMN committed_draft_revision INTEGER CHECK (committed_draft_revision IS NULL OR committed_draft_revision > 0);
CREATE INDEX turn_requests_draft ON turn_requests(draft_id, draft_revision);

ALTER TABLE command_requests ADD COLUMN draft_id TEXT REFERENCES composer_drafts(id);
ALTER TABLE command_requests ADD COLUMN draft_revision INTEGER CHECK (draft_revision IS NULL OR draft_revision >= 0);
ALTER TABLE command_requests ADD COLUMN committed_draft_revision INTEGER CHECK (committed_draft_revision IS NULL OR committed_draft_revision > 0);
CREATE INDEX command_requests_draft ON command_requests(draft_id, draft_revision);

CREATE TABLE composer_resources (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  state TEXT NOT NULL CHECK (state IN ('importing', 'ready', 'failed')),
  attachment_id TEXT REFERENCES attachments(id),
  content_hash TEXT,
  source_json TEXT CHECK (source_json IS NULL OR json_valid(source_json)),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (source_json IS NOT NULL AND state = 'ready' AND attachment_id IS NULL AND content_hash IS NULL AND error_code IS NULL)
    OR (source_json IS NULL AND (
      (state = 'importing' AND attachment_id IS NULL AND content_hash IS NULL AND error_code IS NULL)
      OR (state = 'ready' AND attachment_id IS NOT NULL AND content_hash IS NOT NULL AND error_code IS NULL)
      OR (state = 'failed' AND attachment_id IS NULL AND content_hash IS NULL AND error_code IS NOT NULL AND error_code IN ('IMPORT_FAILED', 'IMPORT_INTERRUPTED'))
    ))
  )
);
CREATE INDEX composer_resources_draft ON composer_resources(draft_id, created_at, id);
CREATE INDEX composer_resources_attachment ON composer_resources(attachment_id);
CREATE UNIQUE INDEX composer_resources_source ON composer_resources(draft_id, source_json) WHERE source_json IS NOT NULL;
`
