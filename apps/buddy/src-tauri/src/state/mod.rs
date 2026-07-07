use tauri::{AppHandle, Runtime};

use crate::{
    app_config::{
        read_buddy_app_settings, update_buddy_app_settings, BuddyAppSettings,
        UpdateBuddyAppSettingsRequest,
    },
    app_paths::{BuddyAppPaths, BuddyAppPathsStatus},
    error::BuddyResult,
    memory,
    storage::{
        AppendBuddyConversationMessageRequest, BuddyApproval, BuddyConversation, BuddyMessage,
        BuddyProject, BuddyReadOnlyTaskApprovalPlan, BuddyReadOnlyTaskDenial,
        BuddyRegisteredAttachment, BuddyResolvedCodexAppServerRequestApproval, BuddyRun,
        BuddySession, BuddySetting, BuddyStorage, BuddyStorageStatus,
        CreateBuddyConversationRequest, CreateBuddyConversationRunRequest,
        CreateBuddyMessageRequest, CreateBuddyRegisteredAttachmentRequest,
        CreateBuddySessionRequest, UpsertBuddyProjectRequest,
    },
};

#[derive(Clone)]
pub struct BuddyAppState {
    paths: BuddyAppPaths,
    storage: BuddyStorage,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyLocalStateStatus {
    paths: BuddyAppPathsStatus,
    storage: BuddyStorageStatus,
}

impl BuddyAppState {
    pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> BuddyResult<Self> {
        let paths = BuddyAppPaths::resolve(app)?;

        Self::initialize_with_paths(paths)
    }

    pub fn initialize_with_paths(paths: BuddyAppPaths) -> BuddyResult<Self> {
        paths.ensure_exists()?;
        memory::workspace::ensure_memory_workspace(&paths.memories_dir_path())?;

        let storage =
            BuddyStorage::new_with_buddy_home(paths.database_path(), paths.data_dir_path());
        storage.initialize()?;

        Ok(Self { paths, storage })
    }

    pub fn local_state_status(&self) -> BuddyResult<BuddyLocalStateStatus> {
        Ok(BuddyLocalStateStatus {
            paths: self.paths.status(),
            storage: self.storage.status_snapshot()?,
        })
    }

    pub fn global_runtime_cwd(&self) -> String {
        self.paths.data_dir_path().to_string_lossy().into_owned()
    }

    pub fn attachments_dir_path(&self) -> std::path::PathBuf {
        self.paths.attachments_dir_path()
    }

    pub fn memories_dir_path(&self) -> std::path::PathBuf {
        self.paths.memories_dir_path()
    }

    pub fn storage_handle(&self) -> BuddyStorage {
        self.storage.clone()
    }

    pub fn app_settings(&self) -> BuddyResult<BuddyAppSettings> {
        read_buddy_app_settings(&self.paths.config_path())
    }

    pub fn update_app_settings(
        &self,
        request: UpdateBuddyAppSettingsRequest,
    ) -> BuddyResult<BuddyAppSettings> {
        update_buddy_app_settings(&self.paths.config_path(), request)
    }

    pub fn create_session(&self, request: CreateBuddySessionRequest) -> BuddyResult<BuddySession> {
        self.storage.create_session(request)
    }

    pub fn create_conversation(
        &self,
        request: CreateBuddyConversationRequest,
    ) -> BuddyResult<BuddyConversation> {
        self.storage.create_conversation(request)
    }

    pub fn find_conversation(&self, id: &str) -> BuddyResult<BuddyConversation> {
        self.storage.find_conversation(id)
    }

    pub fn delete_session(&self, id: String) -> BuddyResult<bool> {
        self.storage.delete_session(id)
    }

    pub fn create_message(&self, request: CreateBuddyMessageRequest) -> BuddyResult<BuddyMessage> {
        self.storage.create_message(request)
    }

    pub fn append_conversation_message(
        &self,
        request: AppendBuddyConversationMessageRequest,
    ) -> BuddyResult<BuddyMessage> {
        self.storage.append_conversation_message(request)
    }

    pub fn create_attachment(
        &self,
        request: CreateBuddyRegisteredAttachmentRequest,
    ) -> BuddyResult<BuddyRegisteredAttachment> {
        self.storage.create_attachment(request)
    }

    pub fn find_attachment(&self, id: &str) -> BuddyResult<Option<BuddyRegisteredAttachment>> {
        self.storage.find_attachment(id)
    }

    pub fn read_setting_json(&self, key: &str) -> BuddyResult<Option<BuddySetting>> {
        self.storage.read_setting_json(key)
    }

    pub fn upsert_project(&self, request: UpsertBuddyProjectRequest) -> BuddyResult<BuddyProject> {
        self.storage.upsert_project(request)
    }

    pub fn find_project(&self, root: &str) -> BuddyResult<Option<BuddyProject>> {
        self.storage.find_project(root)
    }

    pub fn create_conversation_run(
        &self,
        request: CreateBuddyConversationRunRequest,
    ) -> BuddyResult<BuddyRun> {
        self.storage.create_conversation_run(request)
    }

    pub fn find_approval(&self, approval_id: String) -> BuddyResult<BuddyApproval> {
        self.storage.find_approval(approval_id)
    }

    pub fn resolve_codex_app_server_request_approval(
        &self,
        approval_id: String,
        status: String,
    ) -> BuddyResult<BuddyResolvedCodexAppServerRequestApproval> {
        self.storage
            .resolve_codex_app_server_request_approval(approval_id, status)
    }

    pub fn approve_read_only_task_approval(
        &self,
        approval_id: String,
    ) -> BuddyResult<BuddyReadOnlyTaskApprovalPlan> {
        self.storage.approve_read_only_task_approval(approval_id)
    }

    pub fn deny_read_only_task_approval(
        &self,
        approval_id: String,
    ) -> BuddyResult<BuddyReadOnlyTaskDenial> {
        self.storage.deny_read_only_task_approval(approval_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_paths::BuddyAppPaths;

    #[test]
    fn initialize_creates_memory_workspace_files() {
        let data_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-state-memory-workspace-{}",
            uuid::Uuid::new_v4()
        ));

        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
            .expect("initialize state");

        assert!(data_dir.join("memories/global/MEMORY.md").is_file());
        assert!(data_dir.join("memories/global/memory_summary.md").is_file());
        assert!(data_dir.join("memories/global/raw_memories.md").is_file());
        assert!(data_dir.join("memories/global/rollout_summaries").is_dir());
        assert!(data_dir.join("memories/projects").is_dir());

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
