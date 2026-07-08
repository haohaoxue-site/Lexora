use super::*;
use crate::domain::{
    BuddyApprovalTerminalStatus, BuddyRunEventType, BuddyRunStatus, BuddyRunTerminalStatus,
};
use rusqlite::Connection;

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
        .append_run_event(CreateBuddyRunEventRequest::new(
            run.id.clone(),
            BuddyRunEventType::RunStarted,
            serde_json::json!({ "runtime": "codex" }),
        ))
        .expect("append started event");
    storage
        .finish_run(
            run.id.clone(),
            BuddyRunTerminalStatus::Completed,
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
        .append_run_event(CreateBuddyRunEventRequest::new(
            run.id.clone(),
            BuddyRunEventType::MemoryCandidateCreated,
            serde_json::json!({
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
        ))
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
        .append_run_event(CreateBuddyRunEventRequest::new(
            run.id.clone(),
            BuddyRunEventType::RunStarted,
            serde_json::json!({
                "userMessageId": "user-1",
                "unused": large_result.clone(),
            }),
        ))
        .expect("append run started");
    storage
        .append_run_event(CreateBuddyRunEventRequest::projected(
            run.id.clone(),
            "tool.finished",
            serde_json::json!({
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
        ))
        .expect("append tool finished");
    storage
        .append_run_event(CreateBuddyRunEventRequest::projected(
            run.id.clone(),
            "turn.diff.updated",
            serde_json::json!({
                "diff": large_diff.clone(),
                "itemId": "diff-1",
                "turnId": "turn-1",
            }),
        ))
        .expect("append diff updated");
    storage
        .append_run_event(CreateBuddyRunEventRequest::projected(
            run.id.clone(),
            "message.delta",
            serde_json::json!({
                "delta": "hello",
                "itemId": "message-1",
                "phase": "final_answer",
            }),
        ))
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
        .update_run_status(run.id, BuddyRunStatus::Running)
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
        .resolve_codex_app_server_request_approval(approval.id, BuddyApprovalTerminalStatus::Denied)
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

    let log_lines = storage
        .read_local_log_lines_for_test(run.log_path.as_deref().expect("run should have log path"));
    let log_events = parse_jsonl_events(&log_lines);
    let approval_log_event = log_events
        .iter()
        .find(|event| event["type"] == "approval.resolved")
        .expect("approval resolution should be replayable");
    assert_eq!(
        approval_log_event["payload"]["eventType"],
        "approval.resolved"
    );
    assert_eq!(approval_log_event["payload"]["event"]["status"], "denied");
}

#[test]
fn read_only_task_denial_records_replayable_run_events() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            scope: "global".into(),
            runtime: "codex".into(),
            project_root: None,
            title: None,
        })
        .expect("create session");
    let message = storage
        .create_message(CreateBuddyMessageRequest {
            attachments: Vec::new(),
            content: "只读任务".to_owned(),
            role: BuddyMessageRole::User.as_str().to_owned(),
            session_id: session.id.clone(),
        })
        .expect("create message");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            session_id: session.id,
            runtime: "codex".into(),
            cwd: Some("/tmp/lexora".into()),
            external_thread_id: None,
            external_run_id: None,
        })
        .expect("create run");
    let approval = storage
        .create_approval(CreateBuddyApprovalRequest {
            kind: "run.read_only_task".to_owned(),
            payload: serde_json::json!({
                "messageId": message.id,
            }),
            run_id: Some(run.id.clone()),
        })
        .expect("create approval");

    let denial = storage
        .deny_read_only_task_approval(approval.id)
        .expect("deny read-only task");

    assert_eq!(denial.run.status, "cancelled");
    assert_eq!(
        denial
            .events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>(),
        vec!["approval.resolved", "run.cancelled"]
    );

    let log_lines = storage
        .read_local_log_lines_for_test(run.log_path.as_deref().expect("run should have log path"));
    let log_event_types = parse_jsonl_events(&log_lines)
        .iter()
        .map(|event| event["type"].as_str().expect("event type").to_owned())
        .collect::<Vec<_>>();

    assert!(log_event_types.contains(&"approval.resolved".to_owned()));
    assert!(log_event_types.contains(&"run.cancelled".to_owned()));
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

fn parse_jsonl_events(lines: &[String]) -> Vec<serde_json::Value> {
    lines
        .iter()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("jsonl event"))
        .collect()
}

fn create_storage_test_dir(prefix: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("create storage test dir");
    dir
}
