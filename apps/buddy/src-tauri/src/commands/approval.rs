mod app_server;

pub(super) use app_server::wait_for_codex_app_server_approval;

use crate::{
    domain::BuddyApprovalTerminalStatus,
    error::BuddyError,
    intent,
    state::BuddyAppState,
    storage::{
        BuddyApproval, BuddyMessage, BuddyResolvedCodexAppServerRequestApproval, BuddyRun,
        BuddyRunEvent, CODEX_APP_SERVER_REQUEST_APPROVAL_KIND,
    },
};

use super::{
    chat_input::create_text_codex_input,
    codex_runtime::{
        execute_existing_codex_read_only_run, BuddyCodexRunTarget, ExistingCodexReadOnlyRunRequest,
    },
    resolve_runtime_cwd, run_buddy_blocking,
    run_state::BuddyRunStateEventPublisher,
    BuddyCommandResult,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyReadOnlyTaskApprovalTurn {
    approval: BuddyApproval,
    user_message: BuddyMessage,
    assistant_message: BuddyMessage,
    run: BuddyRun,
    events: Vec<BuddyRunEvent>,
}

#[tauri::command]
pub async fn list_buddy_approvals(
    state: tauri::State<'_, BuddyAppState>,
    status: Option<String>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyApproval>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_approvals", move || {
        storage.list_approvals(status, limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub fn deny_buddy_approval(
    state: tauri::State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<serde_json::Value> {
    let approval = state.find_approval(approval_id.clone())?;
    if approval.kind == CODEX_APP_SERVER_REQUEST_APPROVAL_KIND {
        return Ok(
            serde_json::to_value(state.resolve_codex_app_server_request_approval(
                approval_id,
                BuddyApprovalTerminalStatus::Denied,
            )?)
            .map_err(BuddyError::from)?,
        );
    }

    Ok(
        serde_json::to_value(state.deny_read_only_task_approval(approval_id)?)
            .map_err(BuddyError::from)?,
    )
}

#[tauri::command]
pub fn approve_buddy_codex_app_server_request_approval(
    state: tauri::State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<BuddyResolvedCodexAppServerRequestApproval> {
    Ok(state.resolve_codex_app_server_request_approval(
        approval_id,
        BuddyApprovalTerminalStatus::Approved,
    )?)
}

#[tauri::command]
pub fn approve_buddy_read_only_task(
    state: tauri::State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<BuddyReadOnlyTaskApprovalTurn> {
    let plan = state.approve_read_only_task_approval(approval_id)?;
    let (runtime_cwd, source_project) = resolve_runtime_cwd(state.inner(), plan.run.cwd.clone())?;
    let intent_decision = intent::default_agent_task_decision(Some(&runtime_cwd));
    let session_id = plan.message.session_id.clone().ok_or_else(|| {
        BuddyError::Validation("read-only task message is not bound to a session".to_owned())
    })?;
    let execution = execute_existing_codex_read_only_run(ExistingCodexReadOnlyRunRequest {
        approval_id: Some(plan.approval.id.clone()),
        attachment_count: 0,
        runtime_cwd,
        content: plan.message.content.clone(),
        input: create_text_codex_input(&plan.message.content),
        intent_decision,
        memory_root: state.memories_dir_path(),
        model_selection: None,
        run: plan.run,
        selected_context: Vec::new(),
        target: BuddyCodexRunTarget::session(session_id),
        source_project,
        storage: state.storage_handle(),
        cancellation: None,
        event_publisher: BuddyRunStateEventPublisher::disabled(),
        user_message_id: plan.message.id.clone(),
    })?;
    let mut events = vec![plan.event];
    events.extend(execution.events);

    Ok(BuddyReadOnlyTaskApprovalTurn {
        approval: plan.approval,
        assistant_message: execution.assistant_message,
        events,
        run: execution.run,
        user_message: plan.message,
    })
}
