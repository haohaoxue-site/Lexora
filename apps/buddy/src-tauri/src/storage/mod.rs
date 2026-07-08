use std::path::PathBuf;

use crate::{
    domain::{
        BuddyApprovalStatus, BuddyApprovalTerminalStatus, BuddyMessageRole, BuddyRunEventType,
        BuddyRunTerminalStatus,
    },
    error::BuddyResult,
    local_log::LocalLogRuntime,
};

mod approvals;
mod attachments;
mod connection;
mod conversations;
mod lifecycle;
mod memory_candidates;
mod memory_items;
mod memory_source_refs;
mod messages;
mod projects;
mod reconcile;
mod run_events;
mod runs;
mod runtime_bindings;
mod schema;
mod sessions;
mod settings;
mod tasks;

pub use approvals::{
    BuddyApproval, CreateBuddyApprovalRequest, CODEX_APP_SERVER_REQUEST_APPROVAL_KIND,
};
pub use attachments::{BuddyRegisteredAttachment, CreateBuddyRegisteredAttachmentRequest};
pub use conversations::{BuddyConversation, CreateBuddyConversationRequest};
pub use lifecycle::BuddyStorageStatus;
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
pub use schema::CURRENT_SCHEMA_VERSION;
pub use sessions::{BuddySession, CreateBuddySessionRequest};
pub use settings::BuddySetting;
pub use tasks::{BuddyReadOnlyTaskApprovalPlan, BuddyReadOnlyTaskDenial};

#[derive(Clone)]
pub struct BuddyStorage {
    database_path: PathBuf,
    local_logs: LocalLogRuntime,
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

impl BuddyStorage {
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

    pub fn finish_run(
        &self,
        id: String,
        terminal_status: BuddyRunTerminalStatus,
        payload: serde_json::Value,
    ) -> BuddyResult<BuddyFinishedRun> {
        self.with_mut_connection("finish_run", |connection| {
            let status = terminal_status.run_status().as_str();
            let event_type = terminal_status.event_type().as_str();
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
            if run_events::find_latest_run_event_by_type(connection, &id, event_type)?.is_none() {
                self.append_run_event_to_local_log(&current, event_type, &payload)?;
            }

            let transaction = connection.transaction()?;
            let finished_run = runs::finish_run(&transaction, id, terminal_status, payload)?;

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
            let run = runs::find_run(connection, request.run_id())?;
            self.append_run_event_to_local_log(&run, request.event_type(), request.payload())?;

            run_events::append_run_event(connection, request)
        })
    }

    fn append_run_event_to_local_log(
        &self,
        run: &BuddyRun,
        event_type: &str,
        payload: &serde_json::Value,
    ) -> BuddyResult<()> {
        let log_path = run.log_path.as_deref().ok_or_else(|| {
            crate::error::BuddyError::Validation("run is missing logPath".to_owned())
        })?;
        self.local_logs.append_event(
            &self.local_logs.absolute_path(log_path),
            event_type,
            serde_json::json!({
                "event": payload.clone(),
                "eventType": event_type,
                "runId": run.id.as_str(),
            }),
        )?;
        Ok(())
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

    pub fn resolve_codex_app_server_request_approval(
        &self,
        approval_id: String,
        status: BuddyApprovalTerminalStatus,
    ) -> BuddyResult<BuddyResolvedCodexAppServerRequestApproval> {
        self.with_mut_connection("resolve_codex_app_server_request_approval", |connection| {
            let transaction = connection.transaction()?;
            let pending_approval = approvals::find_approval(&transaction, &approval_id)?;
            if pending_approval.status != BuddyApprovalStatus::Pending.as_str() {
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
            let approval = approvals::resolve_approval(&transaction, &approval_id, status)?;
            let payload = serde_json::json!({
                "approvalId": approval.id.as_str(),
                "kind": approval.kind.as_str(),
                "status": approval.status.as_str(),
            });
            let run = runs::find_run(&transaction, &run_id)?;
            let event_type = BuddyRunEventType::ApprovalResolved.as_str();
            self.append_run_event_to_local_log(&run, event_type, &payload)?;
            let event = run_events::append_run_event(
                &transaction,
                CreateBuddyRunEventRequest::new(
                    run_id,
                    BuddyRunEventType::ApprovalResolved,
                    payload,
                ),
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
            tasks::approve_read_only_task_approval(
                connection,
                approval_id,
                |run, event_type, payload| {
                    self.append_run_event_to_local_log(run, event_type, payload)
                },
            )
        })
    }

    pub fn deny_read_only_task_approval(
        &self,
        approval_id: String,
    ) -> BuddyResult<BuddyReadOnlyTaskDenial> {
        self.with_mut_connection("deny_read_only_task_approval", |connection| {
            tasks::deny_read_only_task_approval(
                connection,
                approval_id,
                |run, event_type, payload| {
                    self.append_run_event_to_local_log(run, event_type, payload)
                },
            )
        })
    }
}

#[cfg(test)]
mod tests;
