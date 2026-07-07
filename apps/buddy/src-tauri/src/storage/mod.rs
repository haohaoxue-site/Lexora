use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use rusqlite::Connection;

use crate::{
    app_paths::SQLITE_DIR_NAME,
    domain::{BuddyMessageRole, BuddyRunEventType},
    error::BuddyResult,
    local_log::LocalLogRuntime,
};

mod approvals;
mod attachments;
mod conversations;
mod memory_candidates;
mod memory_items;
mod memory_source_refs;
mod messages;
mod projects;
mod reconcile;
mod run_events;
mod runs;
mod runtime_bindings;
mod sessions;
mod settings;
mod tasks;

pub use approvals::{
    BuddyApproval, CreateBuddyApprovalRequest, CODEX_APP_SERVER_REQUEST_APPROVAL_KIND,
};
pub use attachments::{BuddyRegisteredAttachment, CreateBuddyRegisteredAttachmentRequest};
pub use conversations::{BuddyConversation, CreateBuddyConversationRequest};
pub use memory_candidates::{BuddyMemoryCandidate, CreateBuddyMemoryCandidateRequest};
pub use memory_items::{BuddyMemoryItem, CreateBuddyMemoryItemRequest};
pub use memory_source_refs::{BuddyMemorySourceRef, CreateBuddyMemorySourceRefRequest};
pub use messages::{
    AppendBuddyConversationMessageRequest, BuddyMessage, BuddyMessageAttachment,
    CreateBuddyMessageRequest,
};
pub use projects::{BuddyProject, UpsertBuddyProjectRequest};
pub use run_events::{
    BuddyChatRunEvent, BuddyRunEvent, BuddyRunEventCount, BuddyRunEventSummary,
    CreateBuddyRunEventRequest,
};
pub use runs::{
    BuddyFinishedRun, BuddyRun, CreateBuddyConversationRunRequest, CreateBuddyRunRequest,
};
pub use sessions::{BuddySession, CreateBuddySessionRequest};
pub use settings::BuddySetting;
pub use tasks::{BuddyReadOnlyTaskApprovalPlan, BuddyReadOnlyTaskDenial};

use runtime_bindings::BuddyRuntimeBinding;

pub const CURRENT_SCHEMA_VERSION: i64 = 10;
const STORAGE_BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);
#[cfg(not(test))]
const SLOW_STORAGE_OPERATION_THRESHOLD: Duration = Duration::from_millis(250);

const CURRENT_SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
  runtime TEXT NOT NULL,
  project_root TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  active_branch_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
  project_root TEXT,
  title TEXT,
  log_path TEXT NOT NULL,
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  forked_from_message_id TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conversation_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES conversation_branches(id) ON DELETE SET NULL,
  forked_from_message_id TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  version_group_id TEXT,
  version_index INTEGER NOT NULL DEFAULT 1,
  version_status TEXT NOT NULL DEFAULT 'active' CHECK (version_status IN ('active', 'superseded')),
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS runtime_bindings (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  runtime TEXT NOT NULL,
  cwd TEXT,
  external_thread_id TEXT,
  external_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE,
  triggering_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  intent TEXT,
  log_path TEXT,
  runtime TEXT NOT NULL,
  cwd TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  external_thread_id TEXT,
  external_run_id TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CHECK (session_id IS NOT NULL OR (conversation_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private', 'portable-insight')),
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_project TEXT,
  source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
  memory_id UNINDEXED,
  content,
  tags,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS embedding_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS embedding_vectors (
  item_id TEXT PRIMARY KEY REFERENCES embedding_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS projects (
  root TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'text', 'binary')),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  source_log_path TEXT NOT NULL,
  source_event_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private')),
  project_id TEXT,
  candidate_type TEXT NOT NULL,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  eligibility_json TEXT NOT NULL DEFAULT '{}',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'ignored', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_source_refs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES memory_candidates(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project-private')),
  project_id TEXT,
  relative_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  source_log_path TEXT,
  source_event_id TEXT,
  source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(candidate_id),
  CHECK(line_start > 0),
  CHECK(line_end >= line_start)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created_at ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_session_started_at ON runs(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_run_events_run_id_id ON run_events(run_id, id);
CREATE INDEX IF NOT EXISTS idx_memory_items_scope_updated_at ON memory_items(scope, updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_name_root ON projects(name, root);
CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_conversation_id ON conversation_branches(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_branch_created_at ON messages(conversation_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_active ON messages(conversation_id, branch_id, version_status, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_conversation_branch_started_at ON runs(conversation_id, branch_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_bindings_session_runtime_cwd ON runtime_bindings(session_id, runtime, COALESCE(cwd, '')) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_bindings_conversation_branch_runtime_cwd ON runtime_bindings(conversation_id, branch_id, runtime, COALESCE(cwd, '')) WHERE conversation_id IS NOT NULL AND branch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_candidates_source_event_type
  ON memory_candidates(source_event_id, candidate_type)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_candidates_decision_created
  ON memory_candidates(decision, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_run_id
  ON memory_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_scope_project
  ON memory_source_refs(scope, project_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_source_event
  ON memory_source_refs(source_event_id);
CREATE INDEX IF NOT EXISTS idx_memory_source_refs_source_run
  ON memory_source_refs(source_run_id);
"#;

#[derive(Clone)]
pub struct BuddyStorage {
    database_path: PathBuf,
    local_logs: LocalLogRuntime,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyStorageStatus {
    database_path: String,
    schema_version: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyResolvedCodexAppServerRequestApproval {
    pub approval: BuddyApproval,
    pub event: BuddyRunEvent,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(test), allow(dead_code))]
pub struct BuddyAcceptedMemoryCandidate {
    pub candidate: BuddyMemoryCandidate,
    pub source_ref: BuddyMemorySourceRef,
}

impl BuddyStorageStatus {
    pub fn database_path(&self) -> &str {
        &self.database_path
    }

    pub fn schema_version(&self) -> i64 {
        self.schema_version
    }
}

impl BuddyStorage {
    pub fn new(database_path: PathBuf) -> Self {
        let buddy_home = infer_buddy_home_from_database_path(&database_path);

        Self::new_with_buddy_home(database_path, buddy_home)
    }

    pub fn new_with_buddy_home(database_path: PathBuf, buddy_home: PathBuf) -> Self {
        Self {
            database_path,
            local_logs: LocalLogRuntime::new(buddy_home),
        }
    }

    #[cfg(test)]
    pub fn new_temporary_for_test() -> BuddyResult<Self> {
        let buddy_home =
            std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let database_path = buddy_home.join("sqlite").join("state.sqlite3");
        let storage = Self::new_fixed_for_test(database_path, buddy_home);
        storage.initialize()?;

        Ok(storage)
    }

    #[cfg(test)]
    fn new_fixed_for_test(database_path: PathBuf, buddy_home: PathBuf) -> Self {
        Self {
            database_path,
            local_logs: LocalLogRuntime::fixed_for_test(
                buddy_home,
                crate::local_log::LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7),
            ),
        }
    }

    #[cfg(test)]
    pub fn read_local_log_lines_for_test(&self, relative_path: &str) -> Vec<String> {
        let path = self.local_logs.absolute_path_for_test(relative_path);
        let content = std::fs::read_to_string(path).expect("read local log");

        content.lines().map(str::to_owned).collect()
    }

    pub fn initialize(&self) -> BuddyResult<BuddyStorageStatus> {
        let started_at = Instant::now();
        if let Some(parent) = self.database_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        self.reset_stale_database_file()?;
        let mut connection = self.open_connection()?;
        configure_database_file(&connection)?;
        apply_current_schema(&connection)?;
        self.reconcile_discovered_local_logs(&mut connection)?;
        let status = self.status(&connection)?;
        log_slow_storage_operation("initialize", started_at.elapsed());

        Ok(status)
    }

    pub fn status_snapshot(&self) -> BuddyResult<BuddyStorageStatus> {
        self.with_connection("storage_status_snapshot", |connection| {
            self.status(connection)
        })
    }

    fn open_connection(&self) -> BuddyResult<Connection> {
        let started_at = Instant::now();
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        log_slow_storage_operation("open_connection", started_at.elapsed());

        Ok(connection)
    }

    fn reset_stale_database_file(&self) -> BuddyResult<()> {
        if !self.database_path.exists() {
            return Ok(());
        }

        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let schema_version = read_schema_version(&connection)?;
        drop(connection);

        if schema_version == CURRENT_SCHEMA_VERSION {
            return Ok(());
        }

        remove_sqlite_file_family(&self.database_path)
    }

    fn with_connection<T>(
        &self,
        operation: &'static str,
        run: impl FnOnce(&Connection) -> BuddyResult<T>,
    ) -> BuddyResult<T> {
        let started_at = Instant::now();
        let connection = self.open_connection()?;
        let result = run(&connection);
        log_slow_storage_operation(operation, started_at.elapsed());

        result
    }

    fn with_mut_connection<T>(
        &self,
        operation: &'static str,
        run: impl FnOnce(&mut Connection) -> BuddyResult<T>,
    ) -> BuddyResult<T> {
        let started_at = Instant::now();
        let mut connection = self.open_connection()?;
        let result = run(&mut connection);
        log_slow_storage_operation(operation, started_at.elapsed());

        result
    }

    fn reconcile_discovered_local_logs(&self, connection: &mut Connection) -> BuddyResult<()> {
        let conversation_logs = self.local_logs.discover_conversation_logs()?;
        let run_logs = self.local_logs.discover_run_logs()?;
        if conversation_logs.is_empty() && run_logs.is_empty() {
            return Ok(());
        }

        let transaction = connection.transaction()?;
        for log_path in conversation_logs {
            let absolute_log_path = self.local_logs.checked_absolute_path(&log_path)?;
            reconcile::reconcile_conversation_log(&transaction, &log_path, &absolute_log_path)?;
        }
        for log_path in run_logs {
            let absolute_log_path = self.local_logs.checked_absolute_path(&log_path)?;
            reconcile::reconcile_run_log(&transaction, &log_path, &absolute_log_path)?;
        }
        transaction.commit()?;

        Ok(())
    }

    fn status(&self, connection: &Connection) -> BuddyResult<BuddyStorageStatus> {
        Ok(BuddyStorageStatus {
            database_path: self.database_path.to_string_lossy().into_owned(),
            schema_version: read_schema_version(connection)?,
        })
    }

    pub fn create_session(&self, request: CreateBuddySessionRequest) -> BuddyResult<BuddySession> {
        self.with_connection("create_session", |connection| {
            sessions::create_session(connection, request)
        })
    }

    pub fn list_sessions(&self, limit: i64) -> BuddyResult<Vec<BuddySession>> {
        self.with_connection("list_sessions", |connection| {
            sessions::list_sessions(connection, limit)
        })
    }

    pub fn delete_session(&self, id: String) -> BuddyResult<bool> {
        self.with_connection("delete_session", |connection| {
            sessions::delete_session(connection, &id)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn create_conversation(
        &self,
        request: CreateBuddyConversationRequest,
    ) -> BuddyResult<BuddyConversation> {
        self.with_connection("create_conversation", |connection| {
            let conversation_id = uuid::Uuid::new_v4().to_string();
            let branch_id = uuid::Uuid::new_v4().to_string();
            let absolute_log_path = self.local_logs.conversation_log_path(&conversation_id);
            let log_path = self.local_logs.relative_path(&absolute_log_path)?;
            let prepared = conversations::prepare_conversation_insert(
                connection,
                request,
                conversation_id.clone(),
                branch_id.clone(),
                log_path.clone(),
            )?;
            self.local_logs.append_event(
                &absolute_log_path,
                "conversation_meta",
                serde_json::json!({
                    "activeBranchId": branch_id.clone(),
                    "conversationId": conversation_id.clone(),
                    "forkedFromMessageId": prepared.forked_from_message_id.clone(),
                    "logPath": log_path.clone(),
                    "projectRoot": prepared.project_root.clone(),
                    "scope": prepared.scope,
                    "sourceConversationId": prepared.source_conversation_id.clone(),
                    "sourceRunId": prepared.source_run_id.clone(),
                    "title": prepared.title.clone(),
                }),
            )?;
            self.local_logs
                .append_conversation_index_entry(&conversation_id, &log_path)?;

            conversations::insert_prepared_conversation(connection, prepared)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn find_conversation(&self, id: &str) -> BuddyResult<BuddyConversation> {
        self.with_connection("find_conversation", |connection| {
            conversations::find_conversation(connection, id)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn list_conversations(&self, limit: i64) -> BuddyResult<Vec<BuddyConversation>> {
        self.with_connection("list_conversations", |connection| {
            conversations::list_conversations(connection, limit)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn delete_conversation(&self, id: String) -> BuddyResult<bool> {
        self.with_connection("delete_conversation", |connection| {
            conversations::delete_conversation(connection, &id)
        })
    }

    pub fn create_message(&self, request: CreateBuddyMessageRequest) -> BuddyResult<BuddyMessage> {
        self.with_connection("create_message", |connection| {
            messages::create_message(connection, request)
        })
    }

    pub fn list_messages(&self, session_id: String, limit: i64) -> BuddyResult<Vec<BuddyMessage>> {
        self.with_connection("list_messages", |connection| {
            messages::list_messages(connection, session_id, limit)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn append_conversation_message(
        &self,
        request: AppendBuddyConversationMessageRequest,
    ) -> BuddyResult<BuddyMessage> {
        self.with_connection("append_conversation_message", |connection| {
            let prepared = messages::prepare_conversation_message_insert(connection, request)?;
            let conversation =
                conversations::find_conversation(connection, &prepared.conversation_id)?;
            let absolute_log_path = self.local_logs.absolute_path(&conversation.log_path);
            self.local_logs.append_event(
                &absolute_log_path,
                "message.created",
                serde_json::json!({
                    "attachments": prepared.attachments.clone(),
                    "branchId": prepared.branch_id.clone(),
                    "content": prepared.content.clone(),
                    "conversationId": prepared.conversation_id.clone(),
                    "messageId": prepared.id.clone(),
                    "parentMessageId": prepared.parent_message_id.clone(),
                    "role": prepared.role.clone(),
                    "runId": prepared.run_id.clone(),
                    "versionGroupId": prepared.version_group_id.clone(),
                    "versionIndex": prepared.version_index,
                    "versionStatus": prepared.version_status,
                }),
            )?;

            messages::insert_prepared_conversation_message(connection, prepared)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn append_conversation_event(
        &self,
        conversation_id: String,
        event_type: String,
        payload: serde_json::Value,
    ) -> BuddyResult<()> {
        self.with_connection("append_conversation_event", |connection| {
            let conversation = conversations::find_conversation(connection, &conversation_id)?;
            let absolute_log_path = self.local_logs.absolute_path(&conversation.log_path);
            self.local_logs
                .append_event(&absolute_log_path, event_type, payload)?;

            Ok(())
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn list_active_conversation_messages(
        &self,
        conversation_id: String,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyMessage>> {
        self.with_connection("list_active_conversation_messages", |connection| {
            messages::list_active_conversation_messages(connection, conversation_id, limit)
        })
    }

    pub fn create_attachment(
        &self,
        request: CreateBuddyRegisteredAttachmentRequest,
    ) -> BuddyResult<BuddyRegisteredAttachment> {
        self.with_connection("create_attachment", |connection| {
            attachments::create_attachment(connection, request)
        })
    }

    pub fn find_attachment(&self, id: &str) -> BuddyResult<Option<BuddyRegisteredAttachment>> {
        self.with_connection("find_attachment", |connection| {
            attachments::find_attachment(connection, id)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn create_memory_item(
        &self,
        request: CreateBuddyMemoryItemRequest,
    ) -> BuddyResult<BuddyMemoryItem> {
        self.with_mut_connection("create_memory_item", |connection| {
            memory_items::create_memory_item(connection, request)
        })
    }

    pub fn create_memory_candidate(
        &self,
        request: CreateBuddyMemoryCandidateRequest,
    ) -> BuddyResult<BuddyMemoryCandidate> {
        self.with_mut_connection("create_memory_candidate", |connection| {
            memory_candidates::create_memory_candidate(connection, request)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn find_memory_candidate(&self, id: &str) -> BuddyResult<BuddyMemoryCandidate> {
        self.with_connection("find_memory_candidate", |connection| {
            memory_candidates::find_memory_candidate(connection, id)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn list_memory_candidates(
        &self,
        decision: Option<String>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyMemoryCandidate>> {
        self.with_connection("list_memory_candidates", |connection| {
            memory_candidates::list_memory_candidates(connection, decision.as_deref(), limit)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn list_memory_source_refs(
        &self,
        candidate_id: String,
    ) -> BuddyResult<Vec<BuddyMemorySourceRef>> {
        self.with_connection("list_memory_source_refs", |connection| {
            memory_source_refs::list_memory_source_refs(connection, &candidate_id)
        })
    }

    pub fn list_recent_memory_source_refs(
        &self,
        source_project: Option<&str>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyMemorySourceRef>> {
        self.with_connection("list_recent_memory_source_refs", |connection| {
            memory_source_refs::list_recent_memory_source_refs(connection, source_project, limit)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn accept_memory_candidate_with_source_ref(
        &self,
        request: CreateBuddyMemorySourceRefRequest,
    ) -> BuddyResult<BuddyAcceptedMemoryCandidate> {
        self.with_mut_connection("accept_memory_candidate_with_source_ref", |connection| {
            let transaction = connection.transaction()?;
            let candidate =
                memory_candidates::find_memory_candidate(&transaction, &request.candidate_id)?;
            if !matches!(candidate.decision.as_str(), "pending" | "accepted") {
                return Err(crate::error::BuddyError::Validation(format!(
                    "memory candidate {} cannot be accepted from {}",
                    candidate.id, candidate.decision
                )));
            }

            let source_ref = memory_source_refs::create_memory_source_ref(&transaction, request)?;
            let candidate = memory_candidates::update_memory_candidate_decision(
                &transaction,
                &source_ref.candidate_id,
                "accepted",
            )?;
            transaction.commit()?;

            Ok(BuddyAcceptedMemoryCandidate {
                candidate,
                source_ref,
            })
        })
    }

    pub fn upsert_project(&self, request: UpsertBuddyProjectRequest) -> BuddyResult<BuddyProject> {
        self.with_connection("upsert_project", |connection| {
            projects::upsert_project(connection, request)
        })
    }

    pub fn list_projects(&self, limit: i64) -> BuddyResult<Vec<BuddyProject>> {
        self.with_connection("list_projects", |connection| {
            projects::list_projects(connection, limit)
        })
    }

    pub fn find_project(&self, root: &str) -> BuddyResult<Option<BuddyProject>> {
        self.with_connection("find_project", |connection| {
            projects::find_project(connection, root)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn search_memory_items(
        &self,
        query: &str,
        source_project: Option<&str>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyMemoryItem>> {
        self.with_connection("search_memory_items", |connection| {
            memory_items::search_memory_items(connection, query, source_project, limit)
        })
    }

    pub fn write_setting_json(
        &self,
        key: &str,
        value: serde_json::Value,
    ) -> BuddyResult<BuddySetting> {
        self.with_connection("write_setting_json", |connection| {
            settings::write_setting_json(connection, key, value)
        })
    }

    pub fn read_setting_json(&self, key: &str) -> BuddyResult<Option<BuddySetting>> {
        self.with_connection("read_setting_json", |connection| {
            settings::read_setting_json(connection, key)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn create_run(&self, request: CreateBuddyRunRequest) -> BuddyResult<BuddyRun> {
        self.with_connection("create_run", |connection| {
            sessions::find_session(connection, &request.session_id)?;
            let run_id = uuid::Uuid::new_v4().to_string();
            let absolute_log_path = self.local_logs.run_log_path(&run_id);
            let log_path = self.local_logs.relative_path(&absolute_log_path)?;
            self.local_logs.append_event(
                &absolute_log_path,
                "run_meta",
                serde_json::json!({
                    "runtime": request.runtime.clone(),
                    "cwd": request.cwd.clone(),
                    "externalRunId": request.external_run_id.clone(),
                    "externalThreadId": request.external_thread_id.clone(),
                    "logPath": log_path.clone(),
                    "runId": run_id.clone(),
                    "sessionId": request.session_id.clone(),
                }),
            )?;
            self.local_logs.append_run_index_entry(&run_id, &log_path)?;

            runs::create_run_with_log_path(
                connection,
                runs::PreparedBuddyRunInsert {
                    runtime: request.runtime,
                    branch_id: None,
                    conversation_id: None,
                    cwd: request.cwd,
                    external_run_id: request.external_run_id,
                    external_thread_id: request.external_thread_id,
                    id: run_id,
                    intent: None,
                    log_path,
                    session_id: Some(request.session_id),
                    triggering_message_id: None,
                },
            )
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn create_conversation_run(
        &self,
        request: CreateBuddyConversationRunRequest,
    ) -> BuddyResult<BuddyRun> {
        self.with_connection("create_conversation_run", |connection| {
            let intent = request.intent.trim().to_owned();
            if intent.is_empty() {
                return Err(crate::error::BuddyError::Validation(
                    "run intent is required".to_owned(),
                ));
            }
            let conversation =
                conversations::find_conversation(connection, &request.conversation_id)?;
            if conversation.active_branch_id != request.branch_id {
                return Err(crate::error::BuddyError::Validation(
                    "conversation run must target the active branch".to_owned(),
                ));
            }
            let triggering_message =
                messages::find_message(connection, &request.triggering_message_id)?;
            if triggering_message.conversation_id.as_deref()
                != Some(request.conversation_id.as_str())
                || triggering_message.branch_id.as_deref() != Some(request.branch_id.as_str())
            {
                return Err(crate::error::BuddyError::Validation(
                    "triggering message does not belong to the conversation branch".to_owned(),
                ));
            }
            if triggering_message.role != BuddyMessageRole::User.as_str() {
                return Err(crate::error::BuddyError::Validation(
                    "conversation run must be triggered by a user message".to_owned(),
                ));
            }

            let run_id = uuid::Uuid::new_v4().to_string();
            let conversation_id = request.conversation_id.clone();
            let triggering_message_id = request.triggering_message_id.clone();
            let absolute_log_path = self.local_logs.run_log_path(&run_id);
            let log_path = self.local_logs.relative_path(&absolute_log_path)?;
            self.local_logs.append_event(
                &absolute_log_path,
                "run_meta",
                serde_json::json!({
                    "runtime": request.runtime.clone(),
                    "branchId": request.branch_id.clone(),
                    "conversationId": request.conversation_id.clone(),
                    "cwd": request.cwd.clone(),
                    "externalRunId": request.external_run_id.clone(),
                    "externalThreadId": request.external_thread_id.clone(),
                    "intent": intent.clone(),
                    "logPath": log_path.clone(),
                    "runId": run_id.clone(),
                    "sessionId": null,
                    "triggeringMessageId": request.triggering_message_id.clone(),
                }),
            )?;
            self.local_logs.append_run_index_entry(&run_id, &log_path)?;

            let run = runs::create_run_with_log_path(
                connection,
                runs::PreparedBuddyRunInsert {
                    runtime: request.runtime,
                    branch_id: Some(request.branch_id),
                    conversation_id: Some(request.conversation_id),
                    cwd: request.cwd,
                    external_run_id: request.external_run_id,
                    external_thread_id: request.external_thread_id,
                    id: run_id,
                    intent: Some(intent),
                    log_path,
                    session_id: None,
                    triggering_message_id: Some(request.triggering_message_id),
                },
            )?;
            messages::bind_conversation_message_run(
                connection,
                &conversation_id,
                &triggering_message_id,
                &run.id,
            )?;

            Ok(run)
        })
    }

    pub fn upsert_runtime_binding(
        &self,
        session_id: String,
        runtime: String,
        cwd: Option<String>,
        external_thread_id: Option<String>,
        external_session_id: Option<String>,
    ) -> BuddyResult<BuddyRuntimeBinding> {
        self.with_connection("upsert_runtime_binding", |connection| {
            runtime_bindings::upsert_runtime_binding(
                connection,
                session_id,
                runtime,
                cwd,
                external_thread_id,
                external_session_id,
            )
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn find_conversation_runtime_binding(
        &self,
        conversation_id: String,
        branch_id: String,
        runtime: String,
        cwd: Option<String>,
    ) -> BuddyResult<Option<BuddyRuntimeBinding>> {
        self.with_connection("find_conversation_runtime_binding", |connection| {
            runtime_bindings::find_conversation_runtime_binding(
                connection,
                conversation_id,
                branch_id,
                runtime,
                cwd,
            )
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn upsert_conversation_runtime_binding(
        &self,
        conversation_id: String,
        branch_id: String,
        runtime: String,
        cwd: Option<String>,
        external_thread_id: Option<String>,
        external_session_id: Option<String>,
    ) -> BuddyResult<BuddyRuntimeBinding> {
        self.with_connection("upsert_conversation_runtime_binding", |connection| {
            runtime_bindings::upsert_conversation_runtime_binding(
                connection,
                conversation_id,
                branch_id,
                runtime,
                cwd,
                external_thread_id,
                external_session_id,
            )
        })
    }

    pub fn find_run(&self, id: String) -> BuddyResult<BuddyRun> {
        self.with_connection("find_run", |connection| runs::find_run(connection, &id))
    }

    pub fn list_runs(&self, session_id: Option<String>, limit: i64) -> BuddyResult<Vec<BuddyRun>> {
        self.with_connection("list_runs", |connection| {
            runs::list_runs(connection, session_id, limit)
        })
    }

    pub fn update_run_status(&self, id: String, status: String) -> BuddyResult<BuddyRun> {
        self.with_connection("update_run_status", |connection| {
            runs::update_run_status(connection, id, status)
        })
    }

    pub fn finish_run(
        &self,
        id: String,
        status: String,
        event_type: String,
        payload: serde_json::Value,
    ) -> BuddyResult<BuddyFinishedRun> {
        self.with_mut_connection("finish_run", |connection| {
            let expected_event_type = terminal_event_type(&status).ok_or_else(|| {
                crate::error::BuddyError::Validation(format!(
                    "run terminal status is invalid: {status}"
                ))
            })?;
            if event_type != expected_event_type {
                return Err(crate::error::BuddyError::Validation(format!(
                    "run terminal event {event_type} does not match status {status}"
                )));
            }
            let current = runs::find_run(connection, &id)?;
            if matches!(
                current.status.as_str(),
                "completed" | "failed" | "cancelled"
            ) && current.status != status
            {
                return Err(crate::error::BuddyError::Validation(format!(
                    "run {} is already terminal with status {}",
                    current.id, current.status
                )));
            }
            if run_events::find_latest_run_event_by_type(connection, &id, &event_type)?.is_none() {
                let log_path = current.log_path.as_deref().ok_or_else(|| {
                    crate::error::BuddyError::Validation("run is missing logPath".to_owned())
                })?;
                self.local_logs.append_event(
                    &self.local_logs.absolute_path(log_path),
                    event_type.clone(),
                    serde_json::json!({
                        "event": payload.clone(),
                        "eventType": event_type.clone(),
                        "runId": id.clone(),
                    }),
                )?;
            }

            let transaction = connection.transaction()?;
            let finished_run = runs::finish_run(&transaction, id, status, event_type, payload)?;

            transaction.commit()?;

            Ok(finished_run)
        })
    }

    pub fn update_run_external_refs(
        &self,
        id: String,
        external_thread_id: Option<String>,
        external_run_id: Option<String>,
    ) -> BuddyResult<BuddyRun> {
        self.with_connection("update_run_external_refs", |connection| {
            let run = runs::find_run(connection, &id)?;
            let log_path = run.log_path.as_deref().ok_or_else(|| {
                crate::error::BuddyError::Validation("run is missing logPath".to_owned())
            })?;
            let event_type = BuddyRunEventType::RunExternalRefsUpdated.as_str();
            self.local_logs.append_event(
                &self.local_logs.absolute_path(log_path),
                event_type,
                serde_json::json!({
                    "event": {
                        "runtime": run.runtime.clone(),
                        "branchId": run.branch_id.clone(),
                        "conversationId": run.conversation_id.clone(),
                        "cwd": run.cwd.clone(),
                        "externalRunId": external_run_id.clone(),
                        "externalThreadId": external_thread_id.clone(),
                        "protocol": "codex_app_server",
                    },
                    "eventType": event_type,
                    "runId": id.clone(),
                }),
            )?;

            runs::update_run_external_refs(connection, id, external_thread_id, external_run_id)
        })
    }

    pub fn append_run_event(
        &self,
        request: CreateBuddyRunEventRequest,
    ) -> BuddyResult<BuddyRunEvent> {
        self.with_connection("append_run_event", |connection| {
            let run = runs::find_run(connection, &request.run_id)?;
            let log_path = run.log_path.as_deref().ok_or_else(|| {
                crate::error::BuddyError::Validation("run is missing logPath".to_owned())
            })?;
            let absolute_log_path = self.local_logs.absolute_path(log_path);
            self.local_logs.append_event(
                &absolute_log_path,
                request.event_type.clone(),
                serde_json::json!({
                    "event": request.payload.clone(),
                    "eventType": request.event_type.clone(),
                    "runId": request.run_id.clone(),
                }),
            )?;

            run_events::append_run_event(connection, request)
        })
    }

    pub fn list_run_events(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_run_events", |connection| {
            run_events::list_run_events(connection, run_id, after_id, limit)
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn reconcile_run_log(&self, log_path: &str) -> BuddyResult<BuddyRun> {
        self.with_mut_connection("reconcile_run_log", |connection| {
            let absolute_log_path = self.local_logs.checked_absolute_path(log_path)?;
            let transaction = connection.transaction()?;
            let run = reconcile::reconcile_run_log(&transaction, log_path, &absolute_log_path)?;

            transaction.commit()?;

            Ok(run)
        })
    }

    pub fn count_run_events(&self, run_ids: Vec<String>) -> BuddyResult<Vec<BuddyRunEventCount>> {
        self.with_connection("count_run_events", |connection| {
            run_events::count_run_events(connection, run_ids)
        })
    }

    pub fn list_chat_run_events(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_run_events", |connection| {
            run_events::list_chat_run_events(connection, run_id, after_id, limit)
        })
    }

    pub fn list_run_event_summaries(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
        payload_preview_chars: i64,
    ) -> BuddyResult<Vec<BuddyRunEventSummary>> {
        self.with_connection("list_run_event_summaries", |connection| {
            run_events::list_run_event_summaries(
                connection,
                run_id,
                after_id,
                limit,
                payload_preview_chars,
            )
        })
    }

    pub fn list_session_run_events(
        &self,
        session_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_session_run_events", |connection| {
            run_events::list_session_run_events(
                connection,
                session_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_conversation_run_events(
        &self,
        conversation_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_conversation_run_events", |connection| {
            run_events::list_conversation_run_events(
                connection,
                conversation_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_chat_session_run_events(
        &self,
        session_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_session_run_events", |connection| {
            run_events::list_chat_session_run_events(
                connection,
                session_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_chat_conversation_run_events(
        &self,
        conversation_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_conversation_run_events", |connection| {
            run_events::list_chat_conversation_run_events(
                connection,
                conversation_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_approvals(
        &self,
        status: Option<String>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyApproval>> {
        self.with_connection("list_approvals", |connection| {
            approvals::list_approvals(connection, status, limit)
        })
    }

    pub fn create_approval(
        &self,
        request: CreateBuddyApprovalRequest,
    ) -> BuddyResult<BuddyApproval> {
        self.with_connection("create_approval", |connection| {
            approvals::create_approval(connection, request)
        })
    }

    pub fn find_approval(&self, approval_id: String) -> BuddyResult<BuddyApproval> {
        self.with_connection("find_approval", |connection| {
            approvals::find_approval(connection, &approval_id)
        })
    }

    pub fn resolve_codex_app_server_request_approval(
        &self,
        approval_id: String,
        status: String,
    ) -> BuddyResult<BuddyResolvedCodexAppServerRequestApproval> {
        self.with_mut_connection("resolve_codex_app_server_request_approval", |connection| {
            let transaction = connection.transaction()?;
            let pending_approval = approvals::find_approval(&transaction, &approval_id)?;
            if pending_approval.status != "pending" {
                return Err(crate::error::BuddyError::Validation(
                    "approval is not pending".to_owned(),
                ));
            }
            if pending_approval.kind != CODEX_APP_SERVER_REQUEST_APPROVAL_KIND {
                return Err(crate::error::BuddyError::Validation(
                    "approval is not a codex app-server request".to_owned(),
                ));
            }
            let run_id = pending_approval
                .run_id
                .as_deref()
                .ok_or_else(|| {
                    crate::error::BuddyError::Validation(
                        "approval is not bound to a run".to_owned(),
                    )
                })?
                .to_owned();
            let approval = approvals::resolve_approval(&transaction, &approval_id, &status)?;
            let event = run_events::append_run_event(
                &transaction,
                CreateBuddyRunEventRequest {
                    event_type: "approval.resolved".to_owned(),
                    payload: serde_json::json!({
                        "approvalId": approval.id,
                        "kind": approval.kind,
                        "status": approval.status,
                    }),
                    run_id,
                },
            )?;
            transaction.commit()?;

            Ok(BuddyResolvedCodexAppServerRequestApproval { approval, event })
        })
    }

    pub fn approve_read_only_task_approval(
        &self,
        approval_id: String,
    ) -> BuddyResult<BuddyReadOnlyTaskApprovalPlan> {
        self.with_mut_connection("approve_read_only_task_approval", |connection| {
            tasks::approve_read_only_task_approval(connection, approval_id)
        })
    }

    pub fn deny_read_only_task_approval(
        &self,
        approval_id: String,
    ) -> BuddyResult<BuddyReadOnlyTaskDenial> {
        self.with_mut_connection("deny_read_only_task_approval", |connection| {
            tasks::deny_read_only_task_approval(connection, approval_id)
        })
    }
}

fn terminal_event_type(status: &str) -> Option<&'static str> {
    match status {
        "completed" => Some("run.completed"),
        "failed" => Some("run.failed"),
        "cancelled" => Some("run.cancelled"),
        _ => None,
    }
}

fn infer_buddy_home_from_database_path(database_path: &std::path::Path) -> PathBuf {
    let Some(parent) = database_path.parent() else {
        return PathBuf::from(".");
    };
    if parent
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value == SQLITE_DIR_NAME)
    {
        return parent
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| parent.to_path_buf());
    }

    parent.to_path_buf()
}

fn configure_connection(connection: &Connection) -> BuddyResult<()> {
    connection.busy_timeout(STORAGE_BUSY_TIMEOUT)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;

    Ok(())
}

fn configure_database_file(connection: &Connection) -> BuddyResult<()> {
    connection.pragma_update(None, "journal_mode", "WAL")?;

    Ok(())
}

#[cfg(not(test))]
fn log_slow_storage_operation(operation: &str, elapsed: Duration) {
    if elapsed < SLOW_STORAGE_OPERATION_THRESHOLD {
        return;
    }

    eprintln!(
        "lexora buddy storage operation is slow: {operation} took {}ms",
        elapsed.as_millis()
    );
}

#[cfg(test)]
fn log_slow_storage_operation(_operation: &str, _elapsed: Duration) {}

fn apply_current_schema(connection: &Connection) -> BuddyResult<()> {
    connection.execute_batch(CURRENT_SCHEMA)?;
    connection.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;

    Ok(())
}

fn remove_sqlite_file_family(database_path: &Path) -> BuddyResult<()> {
    for path in [
        database_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", database_path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", database_path.to_string_lossy())),
    ] {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }

    Ok(())
}

fn read_schema_version(connection: &Connection) -> BuddyResult<i64> {
    Ok(connection.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resets_stale_development_database_to_current_schema() {
        let buddy_home = create_storage_test_dir("lexora-buddy-stale-db");
        let database_path = buddy_home.join("sqlite").join("state.sqlite3");
        std::fs::create_dir_all(database_path.parent().expect("sqlite parent"))
            .expect("create sqlite dir");
        {
            let connection = Connection::open(&database_path).expect("open stale database");
            connection
                .execute_batch(
                    r#"
                    CREATE TABLE stale_data(id TEXT PRIMARY KEY);
                    PRAGMA user_version = 1;
                    "#,
                )
                .expect("create stale database");
        }

        let storage = BuddyStorage::new_fixed_for_test(database_path, buddy_home.clone());
        let status = storage.initialize().expect("initialize storage");
        let connection = storage.open_connection().expect("open current database");
        let stale_exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'stale_data')",
                [],
                |row| row.get(0),
            )
            .expect("read sqlite_master");

        assert_eq!(status.schema_version(), CURRENT_SCHEMA_VERSION);
        assert!(!stale_exists);
        std::fs::remove_dir_all(buddy_home).expect("cleanup buddy home");
    }

    #[test]
    fn rejects_project_sessions_without_authorized_project() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let error = storage
            .create_session(CreateBuddySessionRequest {
                scope: "project".into(),
                runtime: "codex".into(),
                project_root: Some("/tmp/lexora".into()),
                title: Some("Project".into()),
            })
            .expect_err("project should require authorization");

        assert!(error.to_string().contains("project is not authorized yet"));
    }

    #[test]
    fn rejects_project_authorization_for_missing_directory() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let missing_root = std::env::temp_dir()
            .join(format!("lexora-buddy-missing-{}", uuid::Uuid::new_v4()))
            .join("project");

        let error = storage
            .upsert_project(UpsertBuddyProjectRequest {
                root: missing_root.to_string_lossy().into_owned(),
                name: Some("Missing".into()),
            })
            .expect_err("missing project root should be rejected");

        assert!(error
            .to_string()
            .contains("project root must be an existing directory"));
    }

    #[test]
    fn active_conversation_messages_exclude_superseded_versions() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let conversation = storage
            .create_conversation(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".into(),
                source_conversation_id: None,
                source_run_id: None,
                title: None,
            })
            .expect("create conversation");

        storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: "older answer".into(),
                conversation_id: conversation.id.clone(),
                parent_message_id: None,
                role: "assistant".into(),
                run_id: None,
                version_group_id: Some("assistant-version".into()),
                version_index: 0,
                version_status: "superseded".into(),
            })
            .expect("append superseded message");
        let active = storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: "new answer".into(),
                conversation_id: conversation.id.clone(),
                parent_message_id: None,
                role: "assistant".into(),
                run_id: None,
                version_group_id: Some("assistant-version".into()),
                version_index: 1,
                version_status: "active".into(),
            })
            .expect("append active message");
        let conversation_id = conversation.id.clone();

        let messages = storage
            .list_active_conversation_messages(conversation_id.clone(), 20)
            .expect("list active messages");

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, active.id);
        assert_eq!(
            messages[0].branch_id.as_deref(),
            Some(conversation.active_branch_id.as_str())
        );
        assert_eq!(messages[0].version_status.as_deref(), Some("active"));

        let log_lines = storage.read_local_log_lines_for_test(&conversation.log_path);
        assert_eq!(log_lines.len(), 3);
        let active_line: serde_json::Value =
            serde_json::from_str(&log_lines[2]).expect("message created jsonl");
        assert_eq!(active_line["type"], "message.created");
        assert_eq!(active_line["payload"]["messageId"], active.id);
        assert_eq!(active_line["payload"]["conversationId"], conversation_id);
        assert_eq!(
            active_line["payload"]["branchId"],
            conversation.active_branch_id
        );
    }

    #[test]
    fn reconciles_run_index_and_events_from_jsonl_after_sqlite_rows_are_deleted() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                scope: "global".into(),
                runtime: "codex".into(),
                project_root: None,
                title: None,
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                session_id: session.id.clone(),
                runtime: "codex".into(),
                cwd: Some("/tmp/recoverable-project".into()),
                external_thread_id: Some("thread-1".into()),
                external_run_id: None,
            })
            .expect("create run");
        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "run.started".into(),
                payload: serde_json::json!({ "runtime": "codex" }),
                run_id: run.id.clone(),
            })
            .expect("append started event");
        storage
            .finish_run(
                run.id.clone(),
                "completed".into(),
                "run.completed".into(),
                serde_json::json!({ "status": "ok" }),
            )
            .expect("finish run");
        let log_path = run.log_path.clone().expect("run should have log path");
        let connection = storage.open_connection().expect("open connection");
        connection
            .execute("DELETE FROM runs WHERE id = ?1", rusqlite::params![run.id])
            .expect("delete run index");

        assert!(storage
            .list_runs(Some(session.id.clone()), 10)
            .expect("list runs")
            .is_empty());

        let restored = storage
            .reconcile_run_log(&log_path)
            .expect("reconcile run log");
        let restored_events = storage
            .list_run_events(restored.id.clone(), None, 10)
            .expect("list restored run events");

        assert_eq!(restored.session_id.as_deref(), Some(session.id.as_str()));
        assert_eq!(restored.status, "completed");
        assert_eq!(restored.cwd.as_deref(), Some("/tmp/recoverable-project"));
        assert_eq!(restored.external_thread_id.as_deref(), Some("thread-1"));
        assert_eq!(restored.log_path.as_deref(), Some(log_path.as_str()));
        assert_eq!(restored_events.len(), 2);
        assert_eq!(restored_events[0].event_type, "run.started");
        assert_eq!(restored_events[0].payload["runtime"], "codex");
        assert_eq!(restored_events[1].event_type, "run.completed");
        assert_eq!(restored_events[1].payload["status"], "ok");
    }

    #[test]
    fn replayed_memory_candidate_event_preserves_project_source() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                scope: "global".into(),
                runtime: "codex".into(),
                project_root: None,
                title: None,
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                session_id: session.id,
                runtime: "codex".into(),
                cwd: Some("/tmp/replay-project".into()),
                external_thread_id: None,
                external_run_id: None,
            })
            .expect("create run");
        let log_path = run.log_path.clone().expect("run should have log path");
        let source_event_id = format!("run:{}:memory_candidate:continuity.chat_turn", run.id);
        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "memory.candidate.created".into(),
                payload: serde_json::json!({
                    "candidateType": "continuity.chat_turn",
                    "confidence": 0.82,
                    "content": "用户希望 Lexora Buddy 从 JSONL replay 记忆写入。",
                    "conversationId": null,
                    "decision": "accepted",
                    "eligibility": {
                        "candidateGeneration": true,
                        "durableWrite": true,
                        "retrieval": true
                    },
                    "projectId": "/tmp/replay-project",
                    "reason": "eligible completed codex turn",
                    "runId": run.id,
                    "scope": "project-private",
                    "sourceEventId": source_event_id,
                    "sourceLogPath": log_path,
                    "sourceRefs": [
                        {
                            "projectId": "/tmp/replay-project",
                            "scope": "project-private",
                            "sourceEventId": source_event_id,
                            "sourceKind": "run_log",
                            "sourceLogPath": log_path,
                            "sourceRunId": run.id
                        }
                    ]
                }),
                run_id: run.id.clone(),
            })
            .expect("append memory candidate event");

        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list candidates before reconcile")
            .is_empty());

        storage
            .reconcile_run_log(&log_path)
            .expect("reconcile run log");
        let candidates = storage
            .list_memory_candidates(Some("accepted".to_owned()), 10)
            .expect("list candidates after reconcile");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].run_id.as_deref(), Some(run.id.as_str()));
        assert_eq!(candidates[0].candidate_type, "continuity.chat_turn");
        assert_eq!(
            candidates[0].source_event_id.as_deref(),
            Some(source_event_id.as_str())
        );
        assert_eq!(
            candidates[0].project_id.as_deref(),
            Some("/tmp/replay-project")
        );
        assert_eq!(candidates[0].source_refs[0]["sourceKind"], "run_log");
    }

    #[test]
    fn lists_chat_run_events_as_compact_transcript_payloads() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                scope: "global".into(),
                runtime: "codex".into(),
                project_root: None,
                title: None,
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                session_id: session.id.clone(),
                runtime: "codex".into(),
                cwd: None,
                external_thread_id: None,
                external_run_id: None,
            })
            .expect("create run");
        let large_result = "A".repeat(20_000);
        let large_diff = format!(
            "diff --git a/src/chat.ts b/src/chat.ts\n+++ b/src/chat.ts\n{}",
            "B".repeat(20_000)
        );

        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "run.started".into(),
                payload: serde_json::json!({
                    "userMessageId": "user-1",
                    "unused": large_result.clone(),
                }),
                run_id: run.id.clone(),
            })
            .expect("append run started");
        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "tool.finished".into(),
                payload: serde_json::json!({
                    "itemId": "tool-1",
                    "item": {
                        "result": {
                            "content": [
                                {
                                    "text": large_result.clone(),
                                    "type": "text",
                                }
                            ],
                        },
                        "status": "completed",
                        "tool": "read_mcp_resource",
                        "type": "mcpToolCall",
                    },
                }),
                run_id: run.id.clone(),
            })
            .expect("append tool finished");
        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "turn.diff.updated".into(),
                payload: serde_json::json!({
                    "diff": large_diff.clone(),
                    "itemId": "diff-1",
                    "turnId": "turn-1",
                }),
                run_id: run.id.clone(),
            })
            .expect("append diff updated");
        storage
            .append_run_event(CreateBuddyRunEventRequest {
                event_type: "message.delta".into(),
                payload: serde_json::json!({
                    "delta": "hello",
                    "itemId": "message-1",
                    "phase": "final_answer",
                }),
                run_id: run.id.clone(),
            })
            .expect("append message delta");

        let chat_events = storage
            .list_chat_session_run_events(session.id, None, 40, 100)
            .expect("list chat events");
        let chat_events_json = serde_json::to_string(&chat_events).expect("serialize chat events");
        let tool_event = chat_events
            .iter()
            .find(|event| event.event_type == "tool.finished")
            .expect("find tool event");
        let diff_event = chat_events
            .iter()
            .find(|event| event.event_type == "turn.diff.updated")
            .expect("find diff event");
        let message_event = chat_events
            .iter()
            .find(|event| event.event_type == "message.delta")
            .expect("find message event");

        assert_eq!(chat_events.len(), 4);
        assert_eq!(tool_event.payload["item"]["tool"], "read_mcp_resource");
        assert_eq!(diff_event.payload["filePaths"][0], "src/chat.ts");
        assert!(diff_event.payload.get("diff").is_none());
        assert_eq!(message_event.payload["delta"], "hello");
        assert!(!chat_events_json.contains(&large_result));
        assert!(!chat_events_json.contains(&large_diff));
        assert!(chat_events_json.len() < 8_000);
    }

    #[test]
    fn resolves_codex_app_server_approval_without_cancelling_the_run() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                scope: "global".into(),
                runtime: "codex".into(),
                project_root: None,
                title: None,
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                session_id: session.id.clone(),
                runtime: "codex".into(),
                cwd: Some("/tmp/lexora".into()),
                external_thread_id: None,
                external_run_id: None,
            })
            .expect("create run");
        let run = storage
            .update_run_status(run.id, "running".to_owned())
            .expect("mark run running");
        let approval = storage
            .create_approval(CreateBuddyApprovalRequest {
                kind: CODEX_APP_SERVER_REQUEST_APPROVAL_KIND.to_owned(),
                payload: serde_json::json!({
                    "runtime": "codex",
                    "method": "item/commandExecution/requestApproval",
                    "promptPreview": "pnpm test",
                    "requestId": 41,
                }),
                run_id: Some(run.id.clone()),
            })
            .expect("create approval");

        let resolution = storage
            .resolve_codex_app_server_request_approval(approval.id, "denied".to_owned())
            .expect("resolve approval");
        let runs = storage.list_runs(Some(session.id), 10).expect("list runs");
        let events = storage
            .list_run_events(run.id, None, 10)
            .expect("list events");

        assert_eq!(resolution.approval.status, "denied");
        assert_eq!(resolution.event.event_type, "approval.resolved");
        assert_eq!(
            resolution.event.payload["kind"],
            CODEX_APP_SERVER_REQUEST_APPROVAL_KIND
        );
        assert_eq!(runs[0].status, "running");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "approval.resolved");
    }

    #[test]
    fn rejects_project_fact_memory_candidate_without_project_scope() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let mut request = CreateBuddyMemoryCandidateRequest {
            candidate_type: "project.fact".to_owned(),
            confidence: 0.91,
            content: "项目事实：Buddy memory replay 要保留项目身份".to_owned(),
            conversation_id: None,
            decision: "accepted".to_owned(),
            eligibility: serde_json::json!({
                "candidateGeneration": true,
                "durableWrite": true,
                "retrieval": true
            }),
            project_id: None,
            reason: "project fact candidate".to_owned(),
            run_id: None,
            scope: "global".to_owned(),
            source_event_id: Some("project-fact-global".to_owned()),
            source_log_path: "runs/project-fact.jsonl".to_owned(),
            source_refs: serde_json::json!([]),
        };

        let global_error = storage
            .create_memory_candidate(request.clone())
            .expect_err("global project fact must be rejected");

        request.scope = "project-private".to_owned();
        request.source_event_id = Some("project-fact-missing-project".to_owned());
        let missing_project_error = storage
            .create_memory_candidate(request.clone())
            .expect_err("project fact without project id must be rejected");

        request.project_id = Some("/tmp/project-alpha".to_owned());
        request.source_event_id = Some("project-fact-valid".to_owned());
        let candidate = storage
            .create_memory_candidate(request)
            .expect("project fact with project id");

        assert!(global_error
            .to_string()
            .contains("project fact memory candidate requires project-private scope"));
        assert!(missing_project_error
            .to_string()
            .contains("project fact memory candidate requires project id"));
        assert_eq!(candidate.scope, "project-private");
        assert_eq!(candidate.project_id.as_deref(), Some("/tmp/project-alpha"));
    }

    fn create_storage_test_dir(prefix: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create storage test dir");
        dir
    }
}
