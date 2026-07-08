use std::{
    fs,
    path::{Path, PathBuf},
};

use super::{
    context::{prepare_codex_run_context, PrepareCodexRunContextRequest},
    persist_completed_codex_run, record_codex_chat_turn_memory, record_codex_run_cancelled,
    terminal_state::record_codex_runtime_error_state,
    BuddyCodexRunTarget, BuddyRunStateEventPublisher,
};
use crate::{
    commands::runtime_events::CodexRuntimeOutput,
    context_pack::BuddyContextPackSelectedContextItem,
    domain::BuddyRunTerminalStatus,
    intent::{self, BuddyIntentClassificationInput},
    storage::{
        AppendBuddyConversationMessageRequest, BuddyStorage, CreateBuddyConversationRequest,
        CreateBuddyConversationRunRequest, CreateBuddyMemoryCandidateRequest,
        CreateBuddyMemoryItemRequest, CreateBuddyRunRequest, CreateBuddySessionRequest,
        UpsertBuddyProjectRequest,
    },
};

#[test]
fn records_cancelled_run_terminal_event() {
    let storage = create_codex_runtime_test_storage();
    let run = create_codex_runtime_test_run(&storage);

    let cancelled = record_codex_run_cancelled(&storage, &run.id, None, "codex_app_server")
        .expect("record cancellation");
    let events = storage
        .list_run_events(run.id, None, 10)
        .expect("list events");

    assert_eq!(cancelled.run.status, "cancelled");
    assert_eq!(events[0].event_type, "run.cancelled");
    assert_eq!(events[0].payload["reason"], "user_cancelled");
    assert_eq!(events[0].payload["protocol"], "codex_app_server");
}

#[test]
fn completed_buddy_agent_turn_binds_assistant_message_to_run() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let conversation = storage
        .create_conversation(CreateBuddyConversationRequest {
            forked_from_message_id: None,
            project_root: None,
            scope: "global".to_owned(),
            source_conversation_id: None,
            source_run_id: None,
            title: Some("Agent turn".to_owned()),
        })
        .expect("create conversation");
    let user_message = storage
        .append_conversation_message(AppendBuddyConversationMessageRequest {
            attachments: Vec::new(),
            branch_id: conversation.active_branch_id.clone(),
            content: "你好".to_owned(),
            conversation_id: conversation.id.clone(),
            parent_message_id: None,
            role: "user".to_owned(),
            run_id: None,
            version_group_id: None,
            version_index: 1,
            version_status: "active".to_owned(),
        })
        .expect("append user message");
    let mut run = storage
        .create_conversation_run(CreateBuddyConversationRunRequest {
            runtime: "codex".to_owned(),
            branch_id: conversation.active_branch_id.clone(),
            conversation_id: conversation.id.clone(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            intent: "buddy.agent.turn".to_owned(),
            triggering_message_id: user_message.id.clone(),
        })
        .expect("create conversation run");
    let target = BuddyCodexRunTarget::conversation(
        conversation.id.clone(),
        conversation.active_branch_id.clone(),
        user_message.id.clone(),
    );
    let runtime_output = CodexRuntimeOutput {
        final_memory_citation: None,
        final_message: "完成".to_owned(),
        protocol: "codex_exec_json_fallback",
        stdout_bytes: Some(6),
        thread_id: None,
        turn_id: None,
    };
    let mut events = Vec::new();

    let assistant_message = persist_completed_codex_run(
        &storage,
        &mut run,
        &mut events,
        &target,
        None,
        &runtime_output,
        "完成",
    )
    .expect("persist assistant message");

    assert_eq!(
        assistant_message.conversation_id.as_deref(),
        Some(conversation.id.as_str())
    );
    assert_eq!(
        assistant_message.branch_id.as_deref(),
        Some(conversation.active_branch_id.as_str())
    );
    assert_eq!(assistant_message.run_id.as_deref(), Some(run.id.as_str()));
    assert_eq!(
        assistant_message.parent_message_id.as_deref(),
        Some(user_message.id.as_str())
    );
    assert_eq!(assistant_message.version_index, Some(1));
    assert_eq!(assistant_message.version_status.as_deref(), Some("active"));
    assert_eq!(run.status, "completed");
    assert!(events
        .iter()
        .any(|event| event.event_type == "message.completed"));

    let conversation_log_lines = storage.read_local_log_lines_for_test(&conversation.log_path);
    let assistant_log = conversation_log_lines
        .iter()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find(|line| {
            line["type"] == "message.created"
                && line["payload"]["role"] == "assistant"
                && line["payload"]["runId"] == run.id
        })
        .expect("assistant message log line");
    assert_eq!(assistant_log["payload"]["versionStatus"], "active");
}

#[test]
fn attachment_task_does_not_query_memory_with_raw_attachment_text() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let memory = storage
        .create_memory_item(CreateBuddyMemoryItemRequest {
            confidence: 1.0,
            content: "ATTACHMENT_ONLY_SECRET_TOKEN".to_owned(),
            expires_at: None,
            memory_type: "continuity.chat_turn".to_owned(),
            scope: "global".to_owned(),
            source_project: None,
            source_run_id: None,
            tags: vec!["attachment".to_owned()],
        })
        .expect("create memory");
    let conversation = storage
        .create_conversation(CreateBuddyConversationRequest {
            forked_from_message_id: None,
            project_root: None,
            scope: "global".to_owned(),
            source_conversation_id: None,
            source_run_id: None,
            title: Some("Attachment task".to_owned()),
        })
        .expect("create conversation");
    let user_message = storage
        .append_conversation_message(AppendBuddyConversationMessageRequest {
            attachments: Vec::new(),
            branch_id: conversation.active_branch_id.clone(),
            content: "分析附件".to_owned(),
            conversation_id: conversation.id.clone(),
            parent_message_id: None,
            role: "user".to_owned(),
            run_id: None,
            version_group_id: None,
            version_index: 1,
            version_status: "active".to_owned(),
        })
        .expect("append user message");
    let run = storage
        .create_conversation_run(CreateBuddyConversationRunRequest {
            runtime: "codex".to_owned(),
            branch_id: conversation.active_branch_id.clone(),
            conversation_id: conversation.id.clone(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            intent: "attachment_task".to_owned(),
            triggering_message_id: user_message.id,
        })
        .expect("create run");
    let decision = intent::classify_buddy_intent(BuddyIntentClassificationInput {
        content: "分析附件",
        cwd: Some("/tmp"),
        has_attachments: true,
        has_context_items: false,
        has_project_scope: false,
        has_structured_inputs: false,
    });
    let target = BuddyCodexRunTarget::conversation(
        conversation.id,
        conversation.active_branch_id,
        "message-user".to_owned(),
    );

    let memory_root = create_buddy_test_dir("lexora-buddy-empty-context-memory");
    let prepared = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: &storage,
        memory_root: &memory_root,
        run_id: &run.id,
        target: &target,
        runtime_cwd: "/tmp",
        source_project: None,
        intent_decision: &decision,
        selected_context: &[],
    })
    .expect("prepare context");

    assert!(prepared.context_pack_diagnostic.injected);
    assert!(prepared
        .runtime_instructions
        .contains("attachment_metadata_only"));
    assert!(!prepared
        .runtime_instructions
        .contains("ATTACHMENT_ONLY_SECRET_TOKEN"));
    assert!(!prepared
        .context_pack_diagnostic
        .source_memory_ids
        .contains(&memory.id));
    assert!(prepared.context_pack_diagnostic.retrieved_memory.is_empty());
    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
}

#[test]
fn context_pack_does_not_inject_legacy_sqlite_memory_items() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let memory_root = create_buddy_test_dir("lexora-buddy-context-legacy-memory");
    let legacy_memory = storage
        .create_memory_item(CreateBuddyMemoryItemRequest {
            confidence: 1.0,
            content: "LEGACY_CONTEXT_PACK_SHOULD_NOT_APPEAR".to_owned(),
            expires_at: None,
            memory_type: "continuity.chat_turn".to_owned(),
            scope: "global".to_owned(),
            source_project: None,
            source_run_id: None,
            tags: vec!["legacy".to_owned()],
        })
        .expect("create legacy memory");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Legacy memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id.clone(),
        })
        .expect("create run");
    let decision = intent::default_agent_task_decision(Some("/tmp"));
    let target = BuddyCodexRunTarget::session(session.id);

    let prepared = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: &storage,
        memory_root: &memory_root,
        run_id: &run.id,
        target: &target,
        runtime_cwd: "/tmp",
        source_project: None,
        intent_decision: &decision,
        selected_context: &[],
    })
    .expect("prepare context");

    assert!(prepared.context_pack_diagnostic.injected);
    assert!(!prepared
        .runtime_instructions
        .contains(&legacy_memory.content));
    assert!(!prepared
        .context_pack_diagnostic
        .source_memory_ids
        .contains(&legacy_memory.id));
    assert!(prepared.context_pack_diagnostic.retrieved_memory.is_empty());

    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
}

#[test]
fn context_pack_injects_accepted_memory_file_refs() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let memory_root = create_buddy_test_dir("lexora-buddy-context-accepted-memory");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Accepted memory context".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id.clone(),
        })
        .expect("create run");
    let candidate = storage
        .create_memory_candidate(CreateBuddyMemoryCandidateRequest {
            candidate_type: "continuity.chat_turn".to_owned(),
            confidence: 0.91,
            content: "用户偏好：Buddy context pack 必须展示文件路径和行号。".to_owned(),
            conversation_id: None,
            decision: "accepted".to_owned(),
            eligibility: serde_json::json!({
                "candidateGeneration": true,
                "durableWrite": true,
                "retrieval": true
            }),
            project_id: None,
            reason: "accepted memory should enter context pack by file ref".to_owned(),
            run_id: Some(run.id.clone()),
            scope: "global".to_owned(),
            source_event_id: Some("event-accepted".to_owned()),
            source_log_path: "runs/accepted.jsonl".to_owned(),
            source_refs: serde_json::json!([{
                "sourceKind": "run_log",
                "sourceRunId": run.id.clone(),
                "sourceEventId": "event-accepted"
            }]),
        })
        .expect("create candidate");
    let accepted =
        crate::memory::candidates::accept_memory_candidate(&storage, &memory_root, &candidate.id)
            .expect("accept candidate");
    let decision = intent::default_agent_task_decision(Some("/tmp"));
    let target = BuddyCodexRunTarget::session(session.id);

    let prepared = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: &storage,
        memory_root: &memory_root,
        run_id: &run.id,
        target: &target,
        runtime_cwd: "/tmp",
        source_project: None,
        intent_decision: &decision,
        selected_context: &[],
    })
    .expect("prepare context");

    assert!(prepared.context_pack_diagnostic.injected);
    assert!(prepared
        .runtime_instructions
        .contains("Lexora Buddy context pack"));
    assert!(prepared
        .runtime_instructions
        .contains("Buddy context pack 必须展示文件路径和行号"));
    assert!(prepared.runtime_instructions.contains("global/MEMORY.md"));
    assert_eq!(prepared.context_pack_diagnostic.source_memory_ids.len(), 0);
    assert_eq!(prepared.context_pack_diagnostic.retrieved_memory.len(), 1);
    assert_eq!(
        prepared.context_pack_diagnostic.retrieved_memory[0].source_kind,
        "buddy_memory_file"
    );
    assert_eq!(
        prepared.context_pack_diagnostic.retrieved_memory[0].path,
        accepted.source_ref.relative_path
    );
    assert_eq!(
        prepared.context_pack_diagnostic.retrieved_memory[0].line_start,
        accepted.source_ref.line_start
    );

    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
}

#[test]
fn context_pack_includes_selected_context_items() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let memory_root = create_buddy_test_dir("lexora-buddy-context-selected-context");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Selected context".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id.clone(),
        })
        .expect("create run");
    let selected_context = vec![BuddyContextPackSelectedContextItem {
        description: Some("处理 Buddy 本地运行时".to_owned()),
        kind: "skill".to_owned(),
        label: "lexora-buddy".to_owned(),
        path: Some("/tmp/skills/lexora-buddy/SKILL.md".to_owned()),
    }];
    let decision = intent::default_agent_task_decision(Some("/tmp"));
    let target = BuddyCodexRunTarget::session(session.id);

    let prepared = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: &storage,
        memory_root: &memory_root,
        run_id: &run.id,
        target: &target,
        runtime_cwd: "/tmp",
        source_project: None,
        intent_decision: &decision,
        selected_context: &selected_context,
    })
    .expect("prepare context");

    assert!(prepared.runtime_instructions.contains("Selected context"));
    assert!(prepared
        .runtime_instructions
        .contains("skill: lexora-buddy"));
    assert!(prepared
        .runtime_instructions
        .contains("/tmp/skills/lexora-buddy/SKILL.md"));
    assert_eq!(
        prepared.context_pack_diagnostic.selected_context.items[0].label,
        "lexora-buddy"
    );

    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
}

#[test]
fn context_pack_excludes_other_project_private_memory_refs() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let memory_root = create_buddy_test_dir("lexora-buddy-context-project-memory");
    let project_a = create_buddy_test_dir("lexora-buddy-context-project-a");
    let project_b = create_buddy_test_dir("lexora-buddy-context-project-b");
    let project_a_id = project_a.to_string_lossy().into_owned();
    let project_b_id = project_b.to_string_lossy().into_owned();
    storage
        .upsert_project(UpsertBuddyProjectRequest {
            name: Some("Project A".to_owned()),
            root: project_a_id.clone(),
        })
        .expect("authorize project a");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: Some(project_a_id.clone()),
            scope: "project".to_owned(),
            title: Some("Project context".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some(project_a_id.clone()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id.clone(),
        })
        .expect("create run");
    let candidate_a = storage
        .create_memory_candidate(CreateBuddyMemoryCandidateRequest {
            candidate_type: "project.fact".to_owned(),
            confidence: 0.9,
            content: "PROJECT_A_ONLY_CONTEXT_MEMORY".to_owned(),
            conversation_id: None,
            decision: "accepted".to_owned(),
            eligibility: serde_json::json!({ "retrieval": true }),
            project_id: Some(project_a_id.clone()),
            reason: "project a context".to_owned(),
            run_id: Some(run.id.clone()),
            scope: "project-private".to_owned(),
            source_event_id: Some("project-a-event".to_owned()),
            source_log_path: "runs/project-a.jsonl".to_owned(),
            source_refs: serde_json::json!([]),
        })
        .expect("create project a candidate");
    let candidate_b = storage
        .create_memory_candidate(CreateBuddyMemoryCandidateRequest {
            candidate_type: "project.fact".to_owned(),
            confidence: 0.9,
            content: "PROJECT_B_MUST_NOT_LEAK_CONTEXT_MEMORY".to_owned(),
            conversation_id: None,
            decision: "accepted".to_owned(),
            eligibility: serde_json::json!({ "retrieval": true }),
            project_id: Some(project_b_id.clone()),
            reason: "project b context".to_owned(),
            run_id: Some(run.id.clone()),
            scope: "project-private".to_owned(),
            source_event_id: Some("project-b-event".to_owned()),
            source_log_path: "runs/project-b.jsonl".to_owned(),
            source_refs: serde_json::json!([]),
        })
        .expect("create project b candidate");
    crate::memory::candidates::accept_memory_candidate(&storage, &memory_root, &candidate_a.id)
        .expect("accept project a candidate");
    crate::memory::candidates::accept_memory_candidate(&storage, &memory_root, &candidate_b.id)
        .expect("accept project b candidate");
    let decision = intent::default_agent_task_decision(Some(project_a_id.as_str()));
    let target = BuddyCodexRunTarget::session(session.id);

    let prepared = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: &storage,
        memory_root: &memory_root,
        run_id: &run.id,
        target: &target,
        runtime_cwd: project_a_id.as_str(),
        source_project: Some(project_a_id.as_str()),
        intent_decision: &decision,
        selected_context: &[],
    })
    .expect("prepare project context");

    assert!(prepared
        .runtime_instructions
        .contains("PROJECT_A_ONLY_CONTEXT_MEMORY"));
    assert!(!prepared
        .runtime_instructions
        .contains("PROJECT_B_MUST_NOT_LEAK_CONTEXT_MEMORY"));
    assert_eq!(prepared.context_pack_diagnostic.retrieved_memory.len(), 1);
    assert_eq!(
        prepared.context_pack_diagnostic.retrieved_memory[0]
            .project_id
            .as_deref(),
        Some(project_a_id.as_str())
    );

    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    fs::remove_dir_all(&project_a).expect("cleanup project a");
    fs::remove_dir_all(&project_b).expect("cleanup project b");
}

#[test]
fn completed_codex_turn_auto_applies_memory_workspace_without_review_queue() {
    let memory_root = create_buddy_test_dir("lexora-buddy-auto-applied-memory");
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");
    let run = storage
        .finish_run(
            run.id,
            BuddyRunTerminalStatus::Completed,
            serde_json::json!({ "status": "ok" }),
        )
        .expect("finish run")
        .run;
    let decision = intent::default_agent_task_decision(Some("/tmp"));

    record_codex_chat_turn_memory(
        &storage,
        &memory_root,
        &run,
        "用户要求记住 LEGACY_DIRECT_MEMORY_WRITE",
        "已处理",
        None,
        &decision,
    );

    let pending_candidates = storage
        .list_memory_candidates(Some("pending".to_owned()), 10)
        .expect("list memory candidates");
    let accepted_candidates = storage
        .list_memory_candidates(Some("accepted".to_owned()), 10)
        .expect("list accepted memory candidates");

    assert!(pending_candidates.is_empty());
    assert_eq!(accepted_candidates.len(), 1);
    assert_eq!(
        accepted_candidates[0].run_id.as_deref(),
        Some(run.id.as_str())
    );
    assert_eq!(
        accepted_candidates[0].candidate_type,
        "continuity.chat_turn"
    );
    assert_eq!(accepted_candidates[0].decision, "accepted");
    assert!(accepted_candidates[0]
        .content
        .contains("LEGACY_DIRECT_MEMORY_WRITE"));
    assert!(storage
        .search_memory_items("LEGACY_DIRECT_MEMORY_WRITE", None, 10)
        .expect("search memory")
        .is_empty());
    let source_refs = storage
        .list_memory_source_refs(accepted_candidates[0].id.clone())
        .expect("list memory source refs");
    let memory =
        fs::read_to_string(memory_root.join("global/MEMORY.md")).expect("read auto-applied memory");

    assert_eq!(source_refs.len(), 1);
    assert_eq!(source_refs[0].source_kind, "buddy_memory_file");
    assert!(memory.contains("LEGACY_DIRECT_MEMORY_WRITE"));

    let run_events = storage
        .list_run_events(run.id.clone(), None, 10)
        .expect("list run events");
    let memory_candidate_events = run_events
        .iter()
        .filter(|event| event.event_type == "memory.candidate.created")
        .collect::<Vec<_>>();

    assert_eq!(memory_candidate_events.len(), 1);
    assert_eq!(
        memory_candidate_events[0].payload["candidateType"],
        "continuity.chat_turn"
    );
    assert_eq!(
        memory_candidate_events[0].payload["sourceEventId"],
        accepted_candidates[0].source_event_id.as_deref().unwrap()
    );
    assert_eq!(
        memory_candidate_events[0].payload["sourceRefs"][0]["sourceKind"],
        "run_log"
    );

    fs::remove_dir_all(&memory_root).expect("cleanup memory root");
}

#[test]
fn completed_codex_turn_with_secret_disables_memory_candidate_without_copying_secret() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Secret memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");
    let run = storage
        .finish_run(
            run.id,
            BuddyRunTerminalStatus::Completed,
            serde_json::json!({ "status": "ok" }),
        )
        .expect("finish run")
        .run;
    let decision = intent::default_agent_task_decision(Some("/tmp"));

    record_codex_chat_turn_memory(
        &storage,
        Path::new("/tmp"),
        &run,
        "请帮我检查 OPENAI_API_KEY=sk-secret-value-1234567890abcdef",
        "已经说明不要把 token 写入长期记忆。",
        None,
        &decision,
    );

    let candidates = storage
        .list_memory_candidates(None, 10)
        .expect("list candidates");

    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].decision, "disabled");
    assert_eq!(
        candidates[0].eligibility["reasons"][0],
        "sensitive_content_detected"
    );
    assert!(!candidates[0].content.contains("sk-secret-value"));
    assert!(!candidates[0].content.contains("OPENAI_API_KEY"));
    assert!(candidates[0].content.contains("敏感内容"));
}

#[test]
fn completed_codex_error_response_does_not_create_memory_candidate() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Error memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");
    let run = storage
        .finish_run(
            run.id,
            BuddyRunTerminalStatus::Completed,
            serde_json::json!({ "status": "ok" }),
        )
        .expect("finish run")
        .run;
    let decision = intent::default_agent_task_decision(Some("/tmp"));

    record_codex_chat_turn_memory(
        &storage,
        Path::new("/tmp"),
        &run,
        "继续刚才的问题",
        "Codex 运行失败：runtime returned an error before producing a final answer.",
        None,
        &decision,
    );

    assert!(storage
        .list_memory_candidates(None, 10)
        .expect("list candidates")
        .is_empty());
}

#[test]
fn runtime_error_disables_durable_memory_candidate() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Runtime error memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");

    record_codex_runtime_error_state(
        &storage,
        &run.id,
        None,
        "codex-app-server",
        None,
        &BuddyRunStateEventPublisher::disabled(),
        "server overloaded",
    )
    .expect("record runtime error");

    let failed_run = storage.find_run(run.id.clone()).expect("find failed run");
    let run_events = storage
        .list_run_events(run.id, None, 10)
        .expect("list run events");
    let failed_event = run_events
        .iter()
        .find(|event| event.event_type == "run.failed")
        .expect("run failed event");

    assert_eq!(failed_run.status, "failed");
    assert!(storage
        .list_memory_candidates(None, 10)
        .expect("list candidates")
        .is_empty());
    assert_eq!(
        failed_event.payload["memoryEligibility"]["candidateGeneration"],
        false
    );
    assert_eq!(
        failed_event.payload["memoryEligibility"]["durableWrite"],
        false
    );
    assert_eq!(
        failed_event.payload["memoryEligibility"]["retrieval"],
        false
    );
    assert_eq!(
        failed_event.payload["memoryEligibility"]["reasons"][0],
        "runtime_error"
    );
}

#[test]
fn queued_codex_turn_does_not_create_memory_candidate() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Queued memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");
    let decision = intent::default_agent_task_decision(Some("/tmp"));

    record_codex_chat_turn_memory(
        &storage,
        Path::new("/tmp"),
        &run,
        "用户要求记住 QUEUED_DIRECT_MEMORY_WRITE",
        "还没有完成",
        None,
        &decision,
    );

    assert!(storage
        .list_memory_candidates(None, 10)
        .expect("list candidates")
        .is_empty());
}

#[test]
fn attachment_task_does_not_create_memory_candidate_after_completed_turn() {
    let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Attachment memory gate".to_owned()),
        })
        .expect("create session");
    let run = storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run");
    let run = storage
        .finish_run(
            run.id,
            BuddyRunTerminalStatus::Completed,
            serde_json::json!({ "status": "ok" }),
        )
        .expect("finish run")
        .run;
    let decision = intent::classify_buddy_intent(BuddyIntentClassificationInput {
        content: "分析附件",
        cwd: Some("/tmp"),
        has_attachments: true,
        has_context_items: false,
        has_project_scope: false,
        has_structured_inputs: false,
    });

    record_codex_chat_turn_memory(
        &storage,
        Path::new("/tmp"),
        &run,
        "分析附件\nATTACHMENT_ONLY_SECRET_TOKEN",
        "已处理附件",
        Some("/tmp".to_owned()),
        &decision,
    );

    assert!(storage
        .list_memory_candidates(None, 10)
        .expect("list candidates")
        .is_empty());
    assert!(storage
        .search_memory_items("ATTACHMENT_ONLY_SECRET_TOKEN", Some("/tmp"), 10)
        .expect("search memory")
        .is_empty());
}

fn create_codex_runtime_test_storage() -> BuddyStorage {
    BuddyStorage::new_temporary_for_test().expect("create storage")
}

fn create_codex_runtime_test_run(storage: &BuddyStorage) -> crate::storage::BuddyRun {
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Codex runtime state".to_owned()),
        })
        .expect("create session");

    storage
        .create_run(CreateBuddyRunRequest {
            runtime: "codex".to_owned(),
            cwd: Some("/tmp/lexora-project".to_owned()),
            external_run_id: None,
            external_thread_id: None,
            session_id: session.id,
        })
        .expect("create run")
}

fn create_buddy_test_dir(prefix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}
