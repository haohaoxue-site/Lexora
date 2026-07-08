use std::{fs, path::PathBuf};

use super::{create_buddy_agent_turn_plan, StartBuddyAgentTurnRequest};
use crate::{
    agents::codex, app_paths::BuddyAppPaths, intent::BuddyChatIntent, state::BuddyAppState,
    storage::CreateBuddyConversationRequest,
};

#[test]
fn creates_first_buddy_agent_turn_with_conversation_seed() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-agent-first-turn");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
            .expect("initialize state");

    let plan = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "分析 Lexora 配置".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("分析 Lexora 配置".to_owned()),
            }),
            cwd: None,
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .expect("create agent turn plan");

    assert_eq!(
        plan.user_message.conversation_id.as_deref(),
        Some(plan.conversation.id.as_str())
    );
    assert_eq!(
        plan.user_message.branch_id.as_deref(),
        Some(plan.conversation.active_branch_id.as_str())
    );
    assert_eq!(
        plan.run
            .as_ref()
            .and_then(|run| run.conversation_id.as_deref()),
        Some(plan.conversation.id.as_str())
    );
    assert_eq!(
        plan.run.as_ref().and_then(|run| run.branch_id.as_deref()),
        Some(plan.conversation.active_branch_id.as_str())
    );
    assert_eq!(
        plan.run
            .as_ref()
            .and_then(|run| run.triggering_message_id.as_deref()),
        Some(plan.user_message.id.as_str())
    );
    assert_eq!(
        plan.run.as_ref().and_then(|run| run.intent.as_deref()),
        Some("buddy.agent.turn")
    );

    let run_log_path = plan
        .run
        .as_ref()
        .and_then(|run| run.log_path.as_deref())
        .expect("run log path");
    let run_log_line = state
        .storage_handle()
        .read_local_log_lines_for_test(run_log_path)
        .into_iter()
        .next()
        .expect("run meta line");
    let run_meta: serde_json::Value = serde_json::from_str(&run_log_line).expect("json line");
    assert_eq!(run_meta["type"], "run_meta");
    assert_eq!(
        run_meta["payload"]["conversationId"],
        plan.conversation.id.as_str()
    );
    assert_eq!(
        run_meta["payload"]["branchId"],
        plan.conversation.active_branch_id.as_str()
    );
    assert_eq!(
        run_meta["payload"]["triggeringMessageId"],
        plan.user_message.id.as_str()
    );
    assert_eq!(run_meta["payload"]["intent"], "buddy.agent.turn");

    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

#[test]
fn companion_chat_does_not_create_codex_run_or_memory_item() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-companion-chat");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
            .expect("initialize state");

    let plan = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "你好".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("你好".to_owned()),
            }),
            cwd: None,
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .expect("create companion turn");

    assert_eq!(plan.decision.intent, BuddyChatIntent::CompanionChat);
    assert!(plan.assistant_message.is_some());
    assert!(plan.run.is_none());
    assert_eq!(
        plan.assistant_message
            .as_ref()
            .map(|message| message.content.as_str()),
        Some("你好，我在。")
    );
    let messages = state
        .storage_handle()
        .list_active_conversation_messages(plan.conversation.id.clone(), 10)
        .expect("list messages");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[1].role, "assistant");
    assert!(messages[1].run_id.is_none());
    assert!(state
        .storage_handle()
        .list_runs(None, 10)
        .expect("list runs")
        .is_empty());
    assert!(state
        .storage_handle()
        .search_memory_items("你好", None, 10)
        .expect("search memory")
        .is_empty());

    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

#[test]
fn direct_answer_in_project_conversation_uses_local_reply_without_project_memory() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-direct-answer");
    let data_dir = temp_dir.join("data");
    let project_root = temp_dir.join("project");
    fs::create_dir_all(&project_root).expect("create project");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
            .expect("initialize state");
    let project = state
        .upsert_project(crate::storage::UpsertBuddyProjectRequest {
            name: Some("Project".to_owned()),
            root: project_root.to_string_lossy().into_owned(),
        })
        .expect("authorize project");
    let storage = state.storage_handle();
    let plan = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "你是谁？".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: Some(project.root.clone()),
                scope: "project".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Project direct answer".to_owned()),
            }),
            cwd: Some(project.root),
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .expect("create direct answer plan");
    let run_events = storage
        .list_conversation_run_events(plan.conversation.id.clone(), None, 20, 20)
        .expect("list conversation run events");
    let messages = storage
        .list_active_conversation_messages(plan.conversation.id.clone(), 10)
        .expect("list messages");

    assert_eq!(plan.decision.intent, BuddyChatIntent::DirectAnswer);
    assert!(!plan.decision.requires_runtime);
    assert_eq!(plan.decision.cwd.as_deref(), None);
    assert!(!plan.decision.memory_eligibility.retrieval);
    assert!(!plan.decision.memory_eligibility.candidate_generation);
    assert!(!plan.decision.memory_eligibility.durable_write);
    assert!(plan.run.is_none());
    assert!(run_events.is_empty());
    assert!(storage
        .list_memory_candidates(None, 10)
        .expect("list memory candidates")
        .is_empty());
    assert_eq!(messages.len(), 2);
    assert!(messages[1].content.contains("Lexora Buddy"));
    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

#[test]
fn agent_turn_records_router_decision_in_conversation_and_run_logs() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-router-decision-log");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
            .expect("initialize state");

    let plan = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "分析当前项目结构".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("分析当前项目结构".to_owned()),
            }),
            cwd: None,
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .expect("create agent turn");
    let run = plan.run.as_ref().expect("runtime run");

    let conversation_events = read_jsonl_events(
        &state
            .storage_handle()
            .read_local_log_lines_for_test(&plan.conversation.log_path),
    );
    let run_events = read_jsonl_events(
        &state
            .storage_handle()
            .read_local_log_lines_for_test(run.log_path.as_deref().expect("run log path")),
    );
    let conversation_decision = conversation_events
        .iter()
        .find(|line| line["type"] == "router.decision")
        .expect("conversation router decision");
    let run_decision = run_events
        .iter()
        .find(|line| line["type"] == "router.decision")
        .expect("run router decision");

    assert_eq!(
        conversation_decision["payload"]["conversationId"],
        plan.conversation.id
    );
    assert_eq!(conversation_decision["payload"]["intent"], "agent_task");
    assert_eq!(conversation_decision["payload"]["runtime"], "codex");
    assert_eq!(
        conversation_decision["payload"]["memoryEligibility"]["retrieval"],
        true
    );
    assert_eq!(
        run_decision["payload"]["event"],
        conversation_decision["payload"]
    );
    assert_eq!(run_decision["payload"]["eventType"], "router.decision");

    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

#[test]
fn rejects_project_agent_turn_when_requested_cwd_belongs_to_another_project() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-agent-cwd");
    let data_dir = temp_dir.join("data");
    let project_a = temp_dir.join("project-a");
    let project_b = temp_dir.join("project-b");
    fs::create_dir_all(&project_a).expect("create project a");
    fs::create_dir_all(&project_b).expect("create project b");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
            .expect("initialize state");
    let project_a = state
        .upsert_project(crate::storage::UpsertBuddyProjectRequest {
            name: Some("Project A".to_owned()),
            root: project_a.to_string_lossy().into_owned(),
        })
        .expect("authorize project a");
    let project_b = state
        .upsert_project(crate::storage::UpsertBuddyProjectRequest {
            name: Some("Project B".to_owned()),
            root: project_b.to_string_lossy().into_owned(),
        })
        .expect("authorize project b");

    let error = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "check workspace".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: Some(project_a.root),
                scope: "project".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Project A".to_owned()),
            }),
            cwd: Some(project_b.root),
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .err()
    .expect("reject mismatched project cwd");

    assert!(error
        .to_string()
        .contains("conversation project root does not match requested cwd"));
    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

fn read_jsonl_events(lines: &[String]) -> Vec<serde_json::Value> {
    lines
        .iter()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("jsonl line"))
        .collect()
}

#[test]
fn rejects_global_conversation_agent_turn_with_project_cwd() {
    let temp_dir = create_buddy_test_dir("lexora-buddy-global-conversation-project-cwd");
    let data_dir = temp_dir.join("data");
    let project_root = temp_dir.join("project");
    fs::create_dir_all(&project_root).expect("create project");
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
            .expect("initialize state");
    let project = state
        .upsert_project(crate::storage::UpsertBuddyProjectRequest {
            name: Some("Project".to_owned()),
            root: project_root.to_string_lossy().into_owned(),
        })
        .expect("authorize project");
    let conversation = state
        .create_conversation(CreateBuddyConversationRequest {
            forked_from_message_id: None,
            project_root: None,
            scope: "global".to_owned(),
            source_conversation_id: None,
            source_run_id: None,
            title: Some("Global".to_owned()),
        })
        .expect("create global conversation");

    let error = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "check workspace".to_owned(),
            context_items: Vec::new(),
            conversation_id: Some(conversation.id),
            conversation_seed: None,
            cwd: Some(project.root),
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .err()
    .expect("reject project cwd for global conversation");

    assert!(error
        .to_string()
        .contains("global conversation cannot run in a project cwd"));
    fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
}

#[test]
fn agent_turn_plan_materializes_and_injects_buddy_builtin_host_skill() {
    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-plan-host-skill-{}",
        uuid::Uuid::new_v4()
    ));
    let state =
        BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
            .expect("initialize state");

    let plan = create_buddy_agent_turn_plan(
        &state,
        StartBuddyAgentTurnRequest {
            attachments: Vec::new(),
            content: "写一篇文章".to_owned(),
            context_items: Vec::new(),
            conversation_id: None,
            conversation_seed: Some(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("测试对话".to_owned()),
            }),
            cwd: None,
            inputs: Vec::new(),
            model_selection: None,
        },
    )
    .expect("create plan");

    let skill_path = plan
        .runtime_inputs
        .iter()
        .find_map(|input| match input {
            codex::CodexUserInput::Skill { name, path } if name == "lexora-buddy-host" => {
                Some(path)
            }
            _ => None,
        })
        .expect("builtin host skill input");
    assert!(skill_path.starts_with(temp_dir.to_string_lossy().as_ref()));
    assert!(skill_path.contains("/host-skills/lexora-buddy-host/"));
    let skill_content = std::fs::read_to_string(skill_path).expect("read skill");
    assert!(skill_content.contains("host-only skill"));
    assert!(skill_content.contains("Do not run commands"));
    assert!(skill_content.contains("name: lexora-buddy-host"));
    assert!(skill_content.contains("<lexora_buddy_host_action>"));
    assert!(!skill_content.contains("name: lexora-buddy-animation"));
    assert!(!skill_content.contains("LEXORA_BUDDY_PET_SOCKET"));
    assert!(!skill_content.contains("native-pet.sock"));
    assert!(!skill_content.contains("diagnose"));
    assert!(!skill_content.contains("node <skill_dir>/scripts/lexora-buddy-pet.mjs"));
    let skill_dir = std::path::Path::new(skill_path)
        .parent()
        .expect("skill dir");
    assert!(!skill_dir.join("scripts").exists());
    assert!(!skill_dir.join("references").exists());
    assert!(!skill_dir.join("agents").exists());

    let _ = std::fs::remove_dir_all(temp_dir);
}

fn create_buddy_test_dir(prefix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}
