use std::{
    collections::BTreeSet,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use crate::error::{BuddyError, BuddyResult};

use super::{
    CodexAppServerOutput, CodexAppServerProjectedEvent, CodexModelOption, CodexModelSelection,
    CodexModelServiceTier, CodexPromptContextOption, CodexPromptContextOptions,
    CodexReasoningEffortOption, CodexUserInput,
};
use transport::CodexAppServerTransport;

mod transport;

#[derive(Debug)]
struct CodexFinalAgentMessage {
    item_id: Option<String>,
    memory_citation: Option<serde_json::Value>,
    phase: Option<String>,
    text: String,
}

const CODEX_APP_SERVER_DELTA_FLUSH_CHAR_LIMIT: usize = 160;
const CODEX_APP_SERVER_DELTA_FLUSH_CHUNK_LIMIT: usize = 8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CodexAppServerApprovalDecision {
    Accept,
    Decline,
    Cancel,
}

#[derive(Clone, Debug)]
pub struct CodexAppServerApprovalRequest {
    pub method: String,
    pub request_id: i64,
    pub thread_id: String,
    pub turn_id: String,
    pub item_id: String,
    pub params: serde_json::Value,
}

impl CodexAppServerApprovalDecision {
    fn as_protocol_value(&self) -> &'static str {
        match self {
            Self::Accept => "accept",
            Self::Decline => "decline",
            Self::Cancel => "cancel",
        }
    }
}

pub fn run_codex_app_server_turn_with_cancellation_and_approval_handler<F, A>(
    input: &[CodexUserInput],
    cwd: &str,
    existing_thread_id: Option<&str>,
    client_user_message_id: &str,
    context_pack: Option<&str>,
    model_selection: Option<&CodexModelSelection>,
    cancellation: Option<Arc<AtomicBool>>,
    on_projected_event: F,
    on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        Path::new("codex"),
        input,
        cwd,
        existing_thread_id,
        client_user_message_id,
        context_pack,
        model_selection,
        cancellation,
        on_projected_event,
        on_approval_request,
    )
}

#[cfg(test)]
fn run_codex_app_server_turn_with_program<F>(
    program: &Path,
    input: &[CodexUserInput],
    cwd: &str,
    client_user_message_id: &str,
    context_pack: Option<&str>,
    model_selection: Option<&CodexModelSelection>,
    on_projected_event: F,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
{
    run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        program,
        input,
        cwd,
        None,
        client_user_message_id,
        context_pack,
        model_selection,
        None,
        on_projected_event,
        |request| {
            Err(BuddyError::Codex(format!(
                "codex app-server requested unsupported interaction: {}",
                request.method
            )))
        },
    )
}

#[cfg(test)]
fn run_codex_app_server_turn_with_program_and_approval_handler<F, A>(
    program: &Path,
    input: &[CodexUserInput],
    cwd: &str,
    client_user_message_id: &str,
    context_pack: Option<&str>,
    model_selection: Option<&CodexModelSelection>,
    on_projected_event: F,
    on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        program,
        input,
        cwd,
        None,
        client_user_message_id,
        context_pack,
        model_selection,
        None,
        on_projected_event,
        on_approval_request,
    )
}

fn run_codex_app_server_turn_with_program_cancellation_and_approval_handler<F, A>(
    program: &Path,
    input: &[CodexUserInput],
    cwd: &str,
    existing_thread_id: Option<&str>,
    client_user_message_id: &str,
    context_pack: Option<&str>,
    model_selection: Option<&CodexModelSelection>,
    cancellation: Option<Arc<AtomicBool>>,
    mut on_projected_event: F,
    mut on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    let mut transport = CodexAppServerTransport::spawn(program)?;
    let _cancellation_watcher = cancellation
        .as_ref()
        .map(|cancellation| transport.spawn_cancellation_watcher(Arc::clone(cancellation)));

    abort_if_app_server_turn_cancelled(cancellation.as_ref())?;
    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    abort_if_app_server_turn_cancelled(cancellation.as_ref())?;
    transport.send(build_app_server_initialized_notification())?;
    let thread =
        start_or_resume_app_server_thread(&mut transport, existing_thread_id, cwd, context_pack)?;

    abort_if_app_server_turn_cancelled(cancellation.as_ref())?;
    transport.send(build_app_server_turn_start_request(
        thread.turn_start_request_id,
        &thread.thread_id,
        client_user_message_id,
        input,
        cwd,
        model_selection,
    ))?;

    let mut turn_state = CodexAppServerTurnProjectionState {
        turn_start_request_id: thread.turn_start_request_id,
        ..Default::default()
    };

    loop {
        abort_if_app_server_turn_cancelled(cancellation.as_ref())?;
        let line = transport.read_line()?;
        abort_if_app_server_turn_cancelled(cancellation.as_ref())?;
        let message = parse_app_server_message(&line)?;
        match handle_codex_app_server_turn_message(
            message,
            &mut turn_state,
            &mut transport,
            &mut on_projected_event,
            &mut on_approval_request,
        )? {
            CodexAppServerTurnMessageOutcome::CloseWithError(error) => {
                transport.close();
                return Err(error);
            }
            CodexAppServerTurnMessageOutcome::Continue => {}
            CodexAppServerTurnMessageOutcome::Completed => break,
        }
    }

    turn_state.delta_buffer.flush(&mut on_projected_event)?;
    transport.close();

    Ok(CodexAppServerOutput {
        final_memory_citation: turn_state.final_memory_citation,
        final_message: turn_state.final_message.trim().to_owned(),
        thread_id: thread.thread_id,
        turn_id: turn_state.turn_id,
    })
}

#[derive(Default)]
struct CodexAppServerTurnProjectionState {
    delta_buffer: CodexAppServerDeltaBuffer,
    final_memory_citation: Option<serde_json::Value>,
    final_message: String,
    last_error_context: Option<String>,
    turn_start_request_id: i64,
    turn_id: Option<String>,
}

enum CodexAppServerTurnMessageOutcome {
    CloseWithError(BuddyError),
    Continue,
    Completed,
}

fn handle_codex_app_server_turn_message<F, A>(
    message: CodexAppServerMessage,
    state: &mut CodexAppServerTurnProjectionState,
    transport: &mut CodexAppServerTransport,
    on_projected_event: &mut F,
    on_approval_request: &mut A,
) -> BuddyResult<CodexAppServerTurnMessageOutcome>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    match message {
        CodexAppServerMessage::Response { id, result } if id == state.turn_start_request_id => {
            state.turn_id = extract_turn_id(&result).or(state.turn_id.take());
        }
        CodexAppServerMessage::JsonRpcError {
            id: Some(id),
            message,
        } if id == state.turn_start_request_id => {
            state.delta_buffer.flush(on_projected_event)?;
            return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                BuddyError::Codex(format!("codex app-server turn/start failed: {message}")),
            ));
        }
        CodexAppServerMessage::AgentMessageDelta {
            thread_id,
            turn_id: delta_turn_id,
            item_id,
            delta,
        } => {
            state.final_message.push_str(&delta);
            state.turn_id.get_or_insert(delta_turn_id.clone());
            state.delta_buffer.push(
                "message.delta",
                thread_id,
                delta_turn_id,
                item_id,
                delta,
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ReasoningTextDelta {
            thread_id,
            turn_id: delta_turn_id,
            item_id,
            delta,
        } => {
            state.turn_id.get_or_insert(delta_turn_id.clone());
            state.delta_buffer.push(
                "reasoning.delta",
                thread_id,
                delta_turn_id,
                item_id,
                delta,
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ReasoningSummaryTextDelta {
            thread_id,
            turn_id: delta_turn_id,
            item_id,
            delta,
        } => {
            state.turn_id.get_or_insert(delta_turn_id.clone());
            state.delta_buffer.push(
                "reasoning.summary_delta",
                thread_id,
                delta_turn_id,
                item_id,
                delta,
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ToolOutputDelta {
            thread_id,
            turn_id: delta_turn_id,
            item_id,
            delta,
        } => {
            state.turn_id.get_or_insert(delta_turn_id.clone());
            state.delta_buffer.push(
                "tool.output_delta",
                thread_id,
                delta_turn_id,
                item_id,
                delta,
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::PlanDelta {
            thread_id,
            turn_id: delta_turn_id,
            item_id,
            delta,
        } => {
            state.turn_id.get_or_insert(delta_turn_id.clone());
            state.delta_buffer.push(
                "plan.delta",
                thread_id,
                delta_turn_id,
                item_id,
                delta,
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::TurnPlanUpdated {
            thread_id,
            turn_id: plan_turn_id,
            explanation,
            plan,
        } => {
            state.turn_id.get_or_insert(plan_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "plan.updated",
                    payload: serde_json::json!({
                        "explanation": explanation,
                        "plan": plan,
                        "protocol": "codex_app_server",
                        "threadId": thread_id,
                        "turnId": plan_turn_id,
                    }),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::TurnDiffUpdated {
            thread_id,
            turn_id: diff_turn_id,
            diff,
        } => {
            state.turn_id.get_or_insert(diff_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            let file_paths = summarize_unified_diff_file_paths(&diff);
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "turn.diff.updated",
                    payload: serde_json::json!({
                        "fileCount": file_paths.len(),
                        "filePaths": file_paths,
                        "hasDiff": !diff.trim().is_empty(),
                        "protocol": "codex_app_server",
                        "threadId": thread_id,
                        "turnId": diff_turn_id,
                    }),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::PatchUpdated {
            thread_id,
            turn_id: patch_turn_id,
            item_id,
            changes,
        } => {
            state.turn_id.get_or_insert(patch_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            let file_paths = summarize_patch_change_file_paths(&changes);
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "tool.patch_updated",
                    payload: serde_json::json!({
                        "changeCount": count_patch_changes(&changes),
                        "fileCount": file_paths.len(),
                        "filePaths": file_paths,
                        "hasChanges": !changes.is_null(),
                        "itemId": item_id,
                        "protocol": "codex_app_server",
                        "threadId": thread_id,
                        "turnId": patch_turn_id,
                    }),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ToolProgress {
            thread_id,
            turn_id: progress_turn_id,
            item_id,
            params,
        } => {
            state.turn_id.get_or_insert(progress_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "tool.progress",
                    payload: with_protocol_fields(
                        params,
                        Some(item_id),
                        thread_id,
                        progress_turn_id,
                    ),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ApprovalRequested {
            method,
            request_id,
            thread_id,
            turn_id: approval_turn_id,
            item_id,
            params,
        } => {
            state.turn_id.get_or_insert(approval_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            let approval_params = params.clone();
            let mut payload = with_method_and_protocol_fields(
                method.clone(),
                params,
                Some(item_id.clone()),
                thread_id.clone(),
                approval_turn_id.clone(),
            );
            if let (Some(payload), Some(request_id)) = (payload.as_object_mut(), request_id) {
                payload.insert("requestId".to_owned(), serde_json::json!(request_id));
            }
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "approval.requested",
                    payload,
                },
                on_projected_event,
            )?;
            let Some(request_id) = request_id else {
                let message = "codex app-server approval request missing request id".to_owned();
                return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                    BuddyError::Codex(message),
                ));
            };
            let request = CodexAppServerApprovalRequest {
                item_id: item_id.clone(),
                method: method.clone(),
                params: approval_params,
                request_id,
                thread_id: thread_id.clone(),
                turn_id: approval_turn_id.clone(),
            };
            let decision = on_approval_request(&request)?;
            transport.send(build_app_server_approval_response(
                request.request_id,
                &request.method,
                decision,
            )?)?;
        }
        CodexAppServerMessage::UserInputRequested {
            request_id,
            thread_id,
            turn_id: input_turn_id,
            item_id,
            params,
        } => {
            state.turn_id.get_or_insert(input_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            let mut payload = with_protocol_fields(params, Some(item_id), thread_id, input_turn_id);
            if let (Some(payload), Some(request_id)) = (payload.as_object_mut(), request_id) {
                payload.insert("requestId".to_owned(), serde_json::json!(request_id));
            }
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "user_input.requested",
                    payload,
                },
                on_projected_event,
            )?;
            if let Some(request_id) = request_id {
                let message = "codex app-server requested unsupported user input".to_owned();
                transport.send(build_app_server_request_error_response(
                    request_id, &message,
                ))?;
                return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                    BuddyError::Codex(message),
                ));
            }
        }
        CodexAppServerMessage::TerminalInteraction {
            thread_id,
            turn_id: interaction_turn_id,
            item_id,
            params,
        } => {
            state.turn_id.get_or_insert(interaction_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "tool.terminal_interaction",
                    payload: with_protocol_fields(
                        params,
                        Some(item_id),
                        thread_id,
                        interaction_turn_id,
                    ),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ReasoningSummaryPartAdded {
            thread_id,
            turn_id: reasoning_turn_id,
            item_id,
            summary_index,
        } => {
            state.turn_id.get_or_insert(reasoning_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "reasoning.summary_part_added",
                    payload: serde_json::json!({
                        "itemId": item_id,
                        "protocol": "codex_app_server",
                        "summaryIndex": summary_index,
                        "threadId": thread_id,
                        "turnId": reasoning_turn_id,
                    }),
                },
                on_projected_event,
            )?;
        }
        CodexAppServerMessage::ItemStarted {
            thread_id,
            turn_id: item_turn_id,
            item,
        } => {
            state.turn_id.get_or_insert(item_turn_id.clone());
            if is_codex_tool_item(&item) {
                state.delta_buffer.flush(on_projected_event)?;
                push_projected_event(
                    CodexAppServerProjectedEvent {
                        event_type: "tool.started",
                        payload: serde_json::json!({
                            "item": item,
                            "itemId": item.get("id").and_then(serde_json::Value::as_str),
                            "protocol": "codex_app_server",
                            "threadId": thread_id,
                            "turnId": item_turn_id,
                        }),
                    },
                    on_projected_event,
                )?;
            }
        }
        CodexAppServerMessage::ItemCompleted {
            thread_id,
            turn_id: item_turn_id,
            item,
        } => {
            state.turn_id.get_or_insert(item_turn_id.clone());
            if item.get("type").and_then(serde_json::Value::as_str) == Some("reasoning") {
                state.delta_buffer.flush(on_projected_event)?;
                push_projected_event(
                    CodexAppServerProjectedEvent {
                        event_type: "reasoning.completed",
                        payload: serde_json::json!({
                            "item": item,
                            "itemId": item.get("id").and_then(serde_json::Value::as_str),
                            "protocol": "codex_app_server",
                            "threadId": thread_id,
                            "turnId": item_turn_id,
                        }),
                    },
                    on_projected_event,
                )?;
            } else if is_codex_tool_item(&item) {
                state.delta_buffer.flush(on_projected_event)?;
                push_projected_event(
                    CodexAppServerProjectedEvent {
                        event_type: "tool.finished",
                        payload: serde_json::json!({
                            "item": item,
                            "itemId": item.get("id").and_then(serde_json::Value::as_str),
                            "protocol": "codex_app_server",
                            "threadId": thread_id,
                            "turnId": item_turn_id,
                        }),
                    },
                    on_projected_event,
                )?;
            }
        }
        CodexAppServerMessage::TurnCompleted {
            thread_id,
            turn_id: completed_turn_id,
            error_message,
            status,
            final_agent_message,
        } => {
            let final_agent_message_payload = final_agent_message.as_ref().map(|message| {
                serde_json::json!({
                    "itemId": message.item_id,
                    "memoryCitation": message.memory_citation,
                    "phase": message.phase,
                    "text": message.text,
                })
            });
            if let Some(message) = final_agent_message {
                if !message.text.trim().is_empty() || state.final_message.is_empty() {
                    state.final_message = message.text;
                }
                if state.final_memory_citation.is_none() {
                    state.final_memory_citation = message.memory_citation;
                }
            }
            state.turn_id.get_or_insert(completed_turn_id.clone());
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "turn.completed",
                    payload: serde_json::json!({
                        "errorMessage": error_message.clone(),
                        "finalAgentMessage": final_agent_message_payload,
                        "protocol": "codex_app_server",
                        "status": status,
                        "threadId": thread_id,
                        "turnId": completed_turn_id,
                    }),
                },
                on_projected_event,
            )?;
            if status != "completed" {
                let message = error_message
                    .unwrap_or_else(|| format!("codex app-server turn ended with status {status}"));
                return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                    BuddyError::Codex(format!("codex app-server turn failed: {message}")),
                ));
            }

            return Ok(CodexAppServerTurnMessageOutcome::Completed);
        }
        CodexAppServerMessage::JsonRpcError { id, message } => {
            state.delta_buffer.flush(on_projected_event)?;
            return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                BuddyError::Codex(format!("codex app-server request {id:?} failed: {message}")),
            ));
        }
        CodexAppServerMessage::ErrorNotification { message } => {
            state.delta_buffer.flush(on_projected_event)?;
            let message = if is_unknown_app_server_error(&message) {
                state.last_error_context.clone().unwrap_or(message)
            } else {
                message
            };
            return Ok(CodexAppServerTurnMessageOutcome::CloseWithError(
                BuddyError::Codex(format!("codex app-server emitted error: {message}")),
            ));
        }
        CodexAppServerMessage::ServerNotification { method, params } => {
            if let Some(context) = summarize_app_server_error_context(&method, &params) {
                state.last_error_context = Some(context);
            }
            state.delta_buffer.flush(on_projected_event)?;
            push_projected_event(
                CodexAppServerProjectedEvent {
                    event_type: "codex.notification",
                    payload: serde_json::json!({
                        "method": method,
                        "params": params,
                        "protocol": "codex_app_server",
                    }),
                },
                on_projected_event,
            )?;
        }
        _ => {}
    }

    Ok(CodexAppServerTurnMessageOutcome::Continue)
}

pub fn load_codex_prompt_context_options(
    cwd: &str,
    file_query: Option<&str>,
) -> BuddyResult<CodexPromptContextOptions> {
    load_codex_prompt_context_options_with_program(Path::new("codex"), cwd, file_query)
}

pub fn load_codex_model_options() -> BuddyResult<Vec<CodexModelOption>> {
    load_codex_model_options_with_program(Path::new("codex"))
}

pub fn check_codex_app_server_smoke() -> BuddyResult<()> {
    let cwd = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-smoke-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&cwd)?;
    let result = check_codex_app_server_smoke_with_program_and_cwd(Path::new("codex"), &cwd);
    let _ = std::fs::remove_dir_all(cwd);

    result
}

fn check_codex_app_server_smoke_with_program_and_cwd(
    program: &Path,
    cwd: &Path,
) -> BuddyResult<()> {
    let cwd = cwd.to_str().ok_or_else(|| {
        BuddyError::Validation("codex app-server smoke cwd is not valid UTF-8".to_owned())
    })?;
    let mut transport = CodexAppServerTransport::spawn(program)?;

    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    transport.send(build_app_server_initialized_notification())?;
    transport.send(build_app_server_smoke_thread_start_request(1, cwd))?;
    let thread_result = read_app_server_response(&mut transport, 1)?;
    extract_thread_id(&thread_result)?;
    transport.close();

    Ok(())
}

fn load_codex_model_options_with_program(program: &Path) -> BuddyResult<Vec<CodexModelOption>> {
    let mut transport = CodexAppServerTransport::spawn(program)?;

    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    transport.send(build_app_server_initialized_notification())?;

    let mut request_id = 1;
    let mut cursor = None;
    let mut models = Vec::new();
    loop {
        transport.send(build_app_server_model_list_request(
            request_id,
            cursor.as_deref(),
        ))?;
        let result = read_app_server_response(&mut transport, request_id)?;
        models.extend(extract_codex_model_options(&result));
        cursor = result
            .get("nextCursor")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        if cursor.is_none() {
            break;
        }

        request_id += 1;
    }

    transport.close();

    Ok(models)
}

fn load_codex_prompt_context_options_with_program(
    program: &Path,
    cwd: &str,
    file_query: Option<&str>,
) -> BuddyResult<CodexPromptContextOptions> {
    let mut transport = CodexAppServerTransport::spawn(program)?;

    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    transport.send(build_app_server_initialized_notification())?;

    transport.send(build_app_server_skills_list_request(1, cwd))?;
    let skills_result = read_app_server_response(&mut transport, 1)?;
    transport.send(build_app_server_plugin_installed_request(2, cwd))?;
    let plugins_result = read_app_server_response(&mut transport, 2)?;

    let files_result = if file_query
        .map(str::trim)
        .is_some_and(|query| !query.is_empty())
    {
        transport.send(build_app_server_fuzzy_file_search_request(
            3,
            cwd,
            file_query.unwrap_or_default(),
        ))?;
        Some(read_app_server_response(&mut transport, 3)?)
    } else {
        None
    };

    transport.close();

    Ok(CodexPromptContextOptions {
        files: files_result
            .as_ref()
            .map(|value| extract_prompt_context_files(value, cwd))
            .unwrap_or_default(),
        plugins: extract_prompt_context_plugins(&plugins_result),
        skills: extract_prompt_context_skills(&skills_result),
    })
}

fn push_projected_event<F>(
    event: CodexAppServerProjectedEvent,
    on_projected_event: &mut F,
) -> BuddyResult<()>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
{
    on_projected_event(&event)?;

    Ok(())
}

#[derive(Default)]
struct CodexAppServerDeltaBuffer {
    pending: Option<CodexAppServerPendingDelta>,
}

struct CodexAppServerPendingDelta {
    event_type: &'static str,
    thread_id: String,
    turn_id: String,
    item_id: String,
    delta: String,
    chunk_count: usize,
}

impl CodexAppServerDeltaBuffer {
    fn push<F>(
        &mut self,
        event_type: &'static str,
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
        on_projected_event: &mut F,
    ) -> BuddyResult<()>
    where
        F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    {
        if delta.is_empty() {
            return Ok(());
        }

        if !self.can_append(event_type, &thread_id, &turn_id, &item_id) {
            self.flush(on_projected_event)?;
        }

        if let Some(pending) = self.pending.as_mut() {
            pending.delta.push_str(&delta);
            pending.chunk_count += 1;
        } else {
            self.pending = Some(CodexAppServerPendingDelta {
                chunk_count: 1,
                delta,
                event_type,
                item_id,
                thread_id,
                turn_id,
            });
        }

        if self.should_flush() {
            self.flush(on_projected_event)?;
        }

        Ok(())
    }

    fn flush<F>(&mut self, on_projected_event: &mut F) -> BuddyResult<()>
    where
        F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    {
        let Some(pending) = self.pending.take() else {
            return Ok(());
        };

        push_projected_event(
            CodexAppServerProjectedEvent {
                event_type: pending.event_type,
                payload: serde_json::json!({
                    "delta": pending.delta,
                    "itemId": pending.item_id,
                    "protocol": "codex_app_server",
                    "threadId": pending.thread_id,
                    "turnId": pending.turn_id,
                }),
            },
            on_projected_event,
        )
    }

    fn can_append(
        &self,
        event_type: &'static str,
        thread_id: &str,
        turn_id: &str,
        item_id: &str,
    ) -> bool {
        self.pending.as_ref().is_some_and(|pending| {
            pending.event_type == event_type
                && pending.thread_id == thread_id
                && pending.turn_id == turn_id
                && pending.item_id == item_id
        })
    }

    fn should_flush(&self) -> bool {
        self.pending.as_ref().is_some_and(|pending| {
            pending.delta.len() >= CODEX_APP_SERVER_DELTA_FLUSH_CHAR_LIMIT
                || pending.chunk_count >= CODEX_APP_SERVER_DELTA_FLUSH_CHUNK_LIMIT
        })
    }
}

fn abort_if_app_server_turn_cancelled(cancellation: Option<&Arc<AtomicBool>>) -> BuddyResult<()> {
    if cancellation.is_some_and(|token| token.load(Ordering::SeqCst)) {
        return Err(BuddyError::Codex(
            "codex app-server turn cancelled".to_owned(),
        ));
    }

    Ok(())
}

struct CodexAppServerThreadSelection {
    thread_id: String,
    turn_start_request_id: i64,
}

fn start_or_resume_app_server_thread(
    transport: &mut CodexAppServerTransport,
    existing_thread_id: Option<&str>,
    cwd: &str,
    context_pack: Option<&str>,
) -> BuddyResult<CodexAppServerThreadSelection> {
    if let Some(existing_thread_id) = existing_thread_id
        .map(str::trim)
        .filter(|thread_id| !thread_id.is_empty())
    {
        transport.send(build_app_server_thread_resume_request(
            1,
            existing_thread_id,
            cwd,
            context_pack,
        ))?;
        match read_app_server_response_result(transport, 1)? {
            CodexAppServerResponseResult::Result(result) => {
                return Ok(CodexAppServerThreadSelection {
                    thread_id: extract_thread_id(&result)?,
                    turn_start_request_id: 2,
                });
            }
            CodexAppServerResponseResult::Error(_) => {
                transport.send(build_app_server_thread_start_request(2, cwd, context_pack))?;
                let thread_result = read_app_server_response(transport, 2)?;
                return Ok(CodexAppServerThreadSelection {
                    thread_id: extract_thread_id(&thread_result)?,
                    turn_start_request_id: 3,
                });
            }
        }
    }

    transport.send(build_app_server_thread_start_request(1, cwd, context_pack))?;
    let thread_result = read_app_server_response(transport, 1)?;

    Ok(CodexAppServerThreadSelection {
        thread_id: extract_thread_id(&thread_result)?,
        turn_start_request_id: 2,
    })
}

fn build_app_server_initialize_request(id: i64) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "initialize",
        "params": {
            "capabilities": {
                "experimentalApi": true,
                "optOutNotificationMethods": [
                    "account/updated",
                    "thread/settings/updated",
                    "thread/tokenUsage/updated",
                ],
            },
            "clientInfo": {
                "name": "lexora_buddy",
                "title": "Lexora",
                "version": env!("CARGO_PKG_VERSION"),
            },
        },
    })
}

fn build_app_server_initialized_notification() -> serde_json::Value {
    serde_json::json!({
        "method": "initialized",
    })
}

fn build_app_server_request_error_response(id: i64, message: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "error": {
            "code": -32000,
            "message": message,
        },
    })
}

fn build_app_server_approval_response(
    id: i64,
    method: &str,
    decision: CodexAppServerApprovalDecision,
) -> BuddyResult<serde_json::Value> {
    match method {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            Ok(serde_json::json!({
                "id": id,
                "result": {
                    "decision": decision.as_protocol_value(),
                },
            }))
        }
        _ => Ok(build_app_server_request_error_response(
            id,
            &format!("codex app-server request denied by Lexora Buddy: {method}"),
        )),
    }
}

fn build_app_server_thread_start_request(
    id: i64,
    cwd: &str,
    context_pack: Option<&str>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "thread/start",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "cwd": cwd,
            "ephemeral": false,
            "runtimeWorkspaceRoots": [cwd],
            "sandbox": "workspace-write",
            "sessionStartSource": "startup",
        },
    });

    if let Some(context_pack) = context_pack {
        request["params"]["developerInstructions"] = serde_json::Value::String(context_pack.into());
    }

    request
}

fn build_app_server_smoke_thread_start_request(id: i64, cwd: &str) -> serde_json::Value {
    let mut request = build_app_server_thread_start_request(id, cwd, None);
    request["params"]["ephemeral"] = serde_json::Value::Bool(true);

    request
}

fn build_app_server_thread_resume_request(
    id: i64,
    thread_id: &str,
    cwd: &str,
    context_pack: Option<&str>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "thread/resume",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "cwd": cwd,
            "excludeTurns": true,
            "runtimeWorkspaceRoots": [cwd],
            "sandbox": "workspace-write",
            "threadId": thread_id,
        },
    });

    if let Some(context_pack) = context_pack {
        request["params"]["developerInstructions"] = serde_json::Value::String(context_pack.into());
    }

    request
}

fn build_app_server_skills_list_request(id: i64, cwd: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "skills/list",
        "params": {
            "cwds": [cwd],
            "forceReload": false,
        },
    })
}

fn build_app_server_plugin_installed_request(id: i64, cwd: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "plugin/installed",
        "params": {
            "cwds": [cwd],
            "installSuggestionPluginNames": null,
        },
    })
}

fn build_app_server_model_list_request(id: i64, cursor: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "model/list",
        "params": {
            "cursor": cursor,
            "includeHidden": false,
            "limit": 100,
        },
    })
}

fn build_app_server_fuzzy_file_search_request(
    id: i64,
    cwd: &str,
    query: &str,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "fuzzyFileSearch",
        "params": {
            "cancellationToken": null,
            "query": query,
            "roots": [cwd],
        },
    })
}

fn build_app_server_turn_start_request(
    id: i64,
    thread_id: &str,
    client_user_message_id: &str,
    input: &[CodexUserInput],
    cwd: &str,
    model_selection: Option<&CodexModelSelection>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "turn/start",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "clientUserMessageId": client_user_message_id,
            "cwd": cwd,
            "input": input,
            "runtimeWorkspaceRoots": [cwd],
            "sandboxPolicy": {
                "type": "workspaceWrite",
                "writableRoots": [cwd],
                "networkAccess": false,
                "excludeTmpdirEnvVar": false,
                "excludeSlashTmp": false,
            },
            "threadId": thread_id,
        },
    });

    if let Some(selection) = model_selection {
        if let Some(model) = selection.model.as_deref().filter(|value| !value.is_empty()) {
            request["params"]["model"] = serde_json::Value::String(model.to_owned());
        }
        if let Some(service_tier) = selection
            .service_tier
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            request["params"]["serviceTier"] = serde_json::Value::String(service_tier.to_owned());
        }
        if let Some(effort) = selection
            .effort
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            request["params"]["effort"] = serde_json::Value::String(effort.to_owned());
        }
    }

    request
}

fn extract_codex_model_options(value: &serde_json::Value) -> Vec<CodexModelOption> {
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter(|model| {
            !model
                .get("hidden")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|model| {
            let model_id = read_json_string(model, "id")?;
            let model_value = read_json_string(model, "model").unwrap_or_else(|| model_id.clone());
            let display_name =
                read_json_string(model, "displayName").unwrap_or_else(|| model_value.clone());

            Some(CodexModelOption {
                runtime: "codex",
                default_reasoning_effort: read_json_string(model, "defaultReasoningEffort"),
                default_service_tier: read_json_string(model, "defaultServiceTier"),
                description: read_json_string(model, "description"),
                display_name,
                id: model_id,
                is_default: model
                    .get("isDefault")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                model: model_value,
                service_tiers: extract_codex_model_service_tiers(model),
                supported_reasoning_efforts: extract_codex_reasoning_effort_options(model),
            })
        })
        .collect()
}

fn extract_codex_reasoning_effort_options(
    model: &serde_json::Value,
) -> Vec<CodexReasoningEffortOption> {
    model
        .get("supportedReasoningEfforts")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|option| {
            let reasoning_effort = option
                .as_str()
                .map(str::to_owned)
                .or_else(|| read_json_string(option, "reasoningEffort"))?;

            Some(CodexReasoningEffortOption {
                description: read_json_string(option, "description"),
                reasoning_effort,
            })
        })
        .collect()
}

fn extract_codex_model_service_tiers(model: &serde_json::Value) -> Vec<CodexModelServiceTier> {
    model
        .get("serviceTiers")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tier| {
            let id = read_json_string(tier, "id")?;
            Some(CodexModelServiceTier {
                description: read_json_string(tier, "description"),
                name: read_json_string(tier, "name").unwrap_or_else(|| id.clone()),
                id,
            })
        })
        .collect()
}

fn extract_prompt_context_skills(value: &serde_json::Value) -> Vec<CodexPromptContextOption> {
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|entry| {
            entry
                .get("skills")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|skill| {
            skill
                .get("enabled")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true)
        })
        .filter_map(|skill| {
            let name = read_json_string(skill, "name")?;
            let path = read_json_string(skill, "path")?;
            let description = skill
                .get("interface")
                .and_then(|interface| read_json_string(interface, "shortDescription"))
                .or_else(|| read_json_string(skill, "shortDescription"))
                .or_else(|| read_json_string(skill, "description"));

            Some(CodexPromptContextOption {
                description,
                kind: "skill",
                label: name.clone(),
                path: Some(path),
                value: name,
            })
        })
        .collect()
}

fn extract_prompt_context_plugins(value: &serde_json::Value) -> Vec<CodexPromptContextOption> {
    value
        .get("marketplaces")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|marketplace| {
            marketplace
                .get("plugins")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|plugin| {
            plugin
                .get("installed")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
                && plugin
                    .get("enabled")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(true)
        })
        .filter_map(|plugin| {
            let value =
                read_json_string(plugin, "id").or_else(|| read_json_string(plugin, "name"))?;
            let label = plugin
                .get("interface")
                .and_then(|interface| read_json_string(interface, "displayName"))
                .or_else(|| read_json_string(plugin, "name"))
                .unwrap_or_else(|| value.clone());
            let description = plugin
                .get("interface")
                .and_then(|interface| read_json_string(interface, "shortDescription"));

            Some(CodexPromptContextOption {
                description,
                kind: "plugin",
                label,
                path: None,
                value,
            })
        })
        .collect()
}

fn extract_prompt_context_files(
    value: &serde_json::Value,
    default_root: &str,
) -> Vec<CodexPromptContextOption> {
    value
        .get("files")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|file| {
            let relative_path = read_json_string(file, "path")?;
            let root = read_json_string(file, "root").unwrap_or_else(|| default_root.to_owned());
            let path = Path::new(&root).join(&relative_path);

            Some(CodexPromptContextOption {
                description: read_json_string(file, "file_name"),
                kind: "file",
                label: relative_path.clone(),
                path: Some(path.to_string_lossy().into_owned()),
                value: relative_path,
            })
        })
        .collect()
}

fn read_json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn read_app_server_response(
    transport: &mut CodexAppServerTransport,
    expected_id: i64,
) -> BuddyResult<serde_json::Value> {
    match read_app_server_response_result(transport, expected_id)? {
        CodexAppServerResponseResult::Result(result) => Ok(result),
        CodexAppServerResponseResult::Error(message) => Err(BuddyError::Codex(format!(
            "codex app-server request {expected_id} failed: {message}"
        ))),
    }
}

enum CodexAppServerResponseResult {
    Error(String),
    Result(serde_json::Value),
}

fn read_app_server_response_result(
    transport: &mut CodexAppServerTransport,
    expected_id: i64,
) -> BuddyResult<CodexAppServerResponseResult> {
    loop {
        let line = transport.read_line()?;
        match parse_app_server_message(&line)? {
            CodexAppServerMessage::Response { id, result } if id == expected_id => {
                return Ok(CodexAppServerResponseResult::Result(result));
            }
            CodexAppServerMessage::JsonRpcError { id, message } if id == Some(expected_id) => {
                return Ok(CodexAppServerResponseResult::Error(message));
            }
            CodexAppServerMessage::ApprovalRequested { method, .. } => {
                return Err(BuddyError::Codex(format!(
                    "codex app-server requested unsupported interaction while waiting for response: {method}"
                )));
            }
            CodexAppServerMessage::UserInputRequested { .. } => {
                return Err(BuddyError::Codex(
                    "codex app-server requested unsupported user input while waiting for response"
                        .to_owned(),
                ));
            }
            CodexAppServerMessage::ErrorNotification { message } => {
                return Err(BuddyError::Codex(format!(
                    "codex app-server emitted error: {message}"
                )));
            }
            _ => {}
        }
    }
}

#[derive(Debug)]
enum CodexAppServerMessage {
    AgentMessageDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ErrorNotification {
        message: String,
    },
    ApprovalRequested {
        method: String,
        request_id: Option<i64>,
        thread_id: String,
        turn_id: String,
        item_id: String,
        params: serde_json::Value,
    },
    ItemCompleted {
        thread_id: String,
        turn_id: String,
        item: serde_json::Value,
    },
    ItemStarted {
        thread_id: String,
        turn_id: String,
        item: serde_json::Value,
    },
    JsonRpcError {
        id: Option<i64>,
        message: String,
    },
    PatchUpdated {
        thread_id: String,
        turn_id: String,
        item_id: String,
        changes: serde_json::Value,
    },
    PlanDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ReasoningSummaryTextDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ReasoningSummaryPartAdded {
        thread_id: String,
        turn_id: String,
        item_id: String,
        summary_index: i64,
    },
    ReasoningTextDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    Response {
        id: i64,
        result: serde_json::Value,
    },
    ToolOutputDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ToolProgress {
        thread_id: String,
        turn_id: String,
        item_id: String,
        params: serde_json::Value,
    },
    TerminalInteraction {
        thread_id: String,
        turn_id: String,
        item_id: String,
        params: serde_json::Value,
    },
    TurnDiffUpdated {
        thread_id: String,
        turn_id: String,
        diff: String,
    },
    TurnPlanUpdated {
        thread_id: String,
        turn_id: String,
        explanation: Option<String>,
        plan: serde_json::Value,
    },
    TurnCompleted {
        thread_id: String,
        turn_id: String,
        error_message: Option<String>,
        status: String,
        final_agent_message: Option<CodexFinalAgentMessage>,
    },
    UserInputRequested {
        request_id: Option<i64>,
        thread_id: String,
        turn_id: String,
        item_id: String,
        params: serde_json::Value,
    },
    ServerNotification {
        method: String,
        params: serde_json::Value,
    },
    Other,
}

fn parse_app_server_message(line: &str) -> BuddyResult<CodexAppServerMessage> {
    let value: serde_json::Value = serde_json::from_str(line)?;
    let request_id = value.get("id").and_then(serde_json::Value::as_i64);

    if let Some(error) = value.get("error") {
        return Ok(CodexAppServerMessage::JsonRpcError {
            id: request_id,
            message: error
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown JSON-RPC error")
                .to_owned(),
        });
    }

    match value.get("method").and_then(serde_json::Value::as_str) {
        Some("item/agentMessage/delta") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::AgentMessageDelta {
                delta: read_string_field(params, "delta")?,
                item_id: read_string_field(params, "itemId")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/reasoning/textDelta") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ReasoningTextDelta {
                delta: read_string_field(params, "delta")?,
                item_id: read_string_field(params, "itemId")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/reasoning/summaryTextDelta") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ReasoningSummaryTextDelta {
                delta: read_string_field(params, "delta")?,
                item_id: read_string_field(params, "itemId")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/reasoning/summaryPartAdded") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ReasoningSummaryPartAdded {
                item_id: read_string_field(params, "itemId")?,
                summary_index: params
                    .get("summaryIndex")
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or_default(),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/plan/delta") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::PlanDelta {
                delta: read_string_field(params, "delta")?,
                item_id: read_string_field(params, "itemId")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("turn/plan/updated") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::TurnPlanUpdated {
                explanation: read_optional_string_field(params, "explanation"),
                plan: params
                    .get("plan")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("turn/diff/updated") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::TurnDiffUpdated {
                diff: read_string_field(params, "diff")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/commandExecution/outputDelta") | Some("item/fileChange/outputDelta") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ToolOutputDelta {
                delta: read_string_field(params, "delta")?,
                item_id: read_string_field(params, "itemId")
                    .or_else(|_| read_string_field(params, "commandId"))
                    .unwrap_or_else(|_| "tool-output".to_owned()),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/fileChange/patchUpdated") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::PatchUpdated {
                changes: params
                    .get("changes")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
                item_id: read_string_field(params, "itemId")?,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/mcpToolCall/progress") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ToolProgress {
                item_id: read_string_field(params, "itemId")?,
                params: params.clone(),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/commandExecution/terminalInteraction") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::TerminalInteraction {
                item_id: read_string_field(params, "itemId")?,
                params: params.clone(),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some(
            method @ ("item/commandExecution/requestApproval"
            | "item/fileChange/requestApproval"
            | "item/permissions/requestApproval"
            | "mcpServer/elicitation/request"),
        ) => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ApprovalRequested {
                item_id: read_string_field(params, "itemId").unwrap_or_else(|_| method.to_owned()),
                method: method.to_owned(),
                params: params.clone(),
                request_id,
                thread_id: read_string_field(params, "threadId").unwrap_or_default(),
                turn_id: read_string_field(params, "turnId").unwrap_or_default(),
            })
        }
        Some("item/tool/requestUserInput") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::UserInputRequested {
                item_id: read_string_field(params, "itemId")?,
                params: params.clone(),
                request_id,
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/started") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ItemStarted {
                item: params
                    .get("item")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("item/completed") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ItemCompleted {
                item: params
                    .get("item")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(params, "turnId")?,
            })
        }
        Some("turn/completed") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            let turn = params.get("turn").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::TurnCompleted {
                error_message: turn.get("error").and_then(extract_structured_error_message),
                final_agent_message: extract_final_agent_message(turn),
                status: turn
                    .get("status")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown")
                    .to_owned(),
                thread_id: read_string_field(params, "threadId")?,
                turn_id: read_string_field(turn, "id")?,
            })
        }
        Some("error") => {
            let params = value.get("params").unwrap_or(&serde_json::Value::Null);
            Ok(CodexAppServerMessage::ErrorNotification {
                message: extract_app_server_error_message(params),
            })
        }
        Some(method) => Ok(CodexAppServerMessage::ServerNotification {
            method: method.to_owned(),
            params: value
                .get("params")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        }),
        _ => {
            if let Some(id) = request_id {
                return Ok(CodexAppServerMessage::Response {
                    id,
                    result: value
                        .get("result")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                });
            }

            Ok(CodexAppServerMessage::Other)
        }
    }
}

fn is_codex_tool_item(item: &serde_json::Value) -> bool {
    matches!(
        item.get("type").and_then(serde_json::Value::as_str),
        Some(
            "commandExecution"
                | "fileChange"
                | "mcpToolCall"
                | "dynamicToolCall"
                | "webSearch"
                | "imageView"
                | "imageGeneration"
                | "collabAgentToolCall"
        )
    )
}

fn read_string_field(value: &serde_json::Value, field: &str) -> BuddyResult<String> {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| BuddyError::Codex(format!("codex app-server message missing {field}")))
}

fn read_optional_string_field(value: &serde_json::Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn extract_app_server_error_message(params: &serde_json::Value) -> String {
    extract_structured_error_message(params)
        .unwrap_or_else(|| "unknown app-server error".to_owned())
}

fn extract_structured_error_message(value: &serde_json::Value) -> Option<String> {
    if let Some(message) = value.as_str().filter(|message| !message.is_empty()) {
        return Some(message.to_owned());
    }

    read_optional_string_field(value, "message")
        .or_else(|| {
            value
                .get("error")
                .and_then(extract_structured_error_message)
        })
        .or_else(|| read_optional_string_field(value, "additionalDetails"))
        .or_else(|| {
            value
                .get("codexErrorInfo")
                .and_then(describe_codex_error_info)
        })
        .or_else(|| read_optional_string_field(value, "code").map(describe_codex_error_code))
}

fn describe_codex_error_info(value: &serde_json::Value) -> Option<String> {
    if let Some(code) = value.as_str() {
        return Some(describe_codex_error_code(code));
    }

    let object = value.as_object()?;
    object
        .keys()
        .next()
        .map(|code| describe_codex_error_code(code))
}

fn describe_codex_error_code(code: impl AsRef<str>) -> String {
    match code.as_ref() {
        "contextWindowExceeded" => "context window exceeded".to_owned(),
        "usageLimitExceeded" => "usage limit exceeded".to_owned(),
        "serverOverloaded" => "server overloaded".to_owned(),
        "cyberPolicy" => "request blocked by policy".to_owned(),
        "internalServerError" => "internal server error".to_owned(),
        "unauthorized" => "unauthorized".to_owned(),
        "badRequest" => "bad request".to_owned(),
        "threadRollbackFailed" => "thread rollback failed".to_owned(),
        "sandboxError" => "sandbox error".to_owned(),
        "httpConnectionFailed" => "HTTP connection failed".to_owned(),
        "responseStreamConnectionFailed" => "response stream connection failed".to_owned(),
        "responseStreamDisconnected" => "response stream disconnected".to_owned(),
        "responseTooManyFailedAttempts" => "response failed too many times".to_owned(),
        "activeTurnNotSteerable" => "active turn cannot be steered".to_owned(),
        "other" => "other app-server error".to_owned(),
        value => value.to_owned(),
    }
}

fn is_unknown_app_server_error(message: &str) -> bool {
    message
        .trim()
        .eq_ignore_ascii_case("unknown app-server error")
}

fn summarize_app_server_error_context(method: &str, params: &serde_json::Value) -> Option<String> {
    if method == "thread/status/changed" {
        let status_type = params
            .get("status")
            .and_then(|status| status.get("type"))
            .and_then(serde_json::Value::as_str);
        if status_type == Some("systemError") {
            return Some("thread entered system error state".to_owned());
        }
    }

    if method == "account/rateLimits/updated" {
        let rate_limits = params.get("rateLimits").unwrap_or(&serde_json::Value::Null);
        if let Some(limit_type) = rate_limits
            .get("rateLimitReachedType")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
        {
            return Some(format!("rate limit reached: {limit_type}"));
        }

        let credits = rate_limits
            .get("credits")
            .unwrap_or(&serde_json::Value::Null);
        if credits
            .get("hasCredits")
            .and_then(serde_json::Value::as_bool)
            .is_some_and(|has_credits| !has_credits)
            && !credits
                .get("unlimited")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or_default()
        {
            return Some("Codex credits are depleted".to_owned());
        }
    }

    if method == "mcpServer/startupStatus/updated" {
        let status = params
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if status == "failed" || status == "cancelled" {
            let name = params
                .get("name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("MCP server");
            let error = params
                .get("error")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty());
            return Some(match error {
                Some(error) => format!("{name} startup {status}: {error}"),
                None => format!("{name} startup {status}"),
            });
        }
    }

    None
}

fn summarize_unified_diff_file_paths(diff: &str) -> Vec<String> {
    let mut file_paths = BTreeSet::new();
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = rest
                .split_whitespace()
                .nth(1)
                .and_then(normalize_codex_project_file_path)
            {
                file_paths.insert(path);
            }
            continue;
        }

        if let Some(path) = line
            .strip_prefix("+++ ")
            .or_else(|| line.strip_prefix("--- "))
            .and_then(normalize_codex_project_file_path)
        {
            file_paths.insert(path);
        }
    }

    file_paths.into_iter().collect()
}

fn summarize_patch_change_file_paths(changes: &serde_json::Value) -> Vec<String> {
    let mut file_paths = BTreeSet::new();
    collect_patch_change_file_paths(changes, &mut file_paths);

    file_paths.into_iter().collect()
}

fn collect_patch_change_file_paths(value: &serde_json::Value, file_paths: &mut BTreeSet<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_patch_change_file_paths(item, file_paths);
            }
        }
        serde_json::Value::Object(object) => {
            for key in ["path", "filePath", "file_path", "targetFile", "target_file"] {
                if let Some(path) = object
                    .get(key)
                    .and_then(serde_json::Value::as_str)
                    .and_then(normalize_codex_project_file_path)
                {
                    file_paths.insert(path);
                }
            }
            for value in object.values() {
                collect_patch_change_file_paths(value, file_paths);
            }
        }
        _ => {}
    }
}

fn count_patch_changes(changes: &serde_json::Value) -> usize {
    match changes {
        serde_json::Value::Array(items) => items.len(),
        serde_json::Value::Object(object) => object.len(),
        serde_json::Value::Null => 0,
        _ => 1,
    }
}

fn normalize_codex_project_file_path(path: &str) -> Option<String> {
    let path = path.trim().trim_matches('"');
    if path.is_empty() || path == "/dev/null" {
        return None;
    }

    Some(
        path.strip_prefix("a/")
            .or_else(|| path.strip_prefix("b/"))
            .unwrap_or(path)
            .to_owned(),
    )
}

fn with_method_and_protocol_fields(
    method: String,
    params: serde_json::Value,
    item_id: Option<String>,
    thread_id: String,
    turn_id: String,
) -> serde_json::Value {
    let mut payload = with_protocol_fields(params, item_id, thread_id, turn_id);
    if let Some(payload) = payload.as_object_mut() {
        payload.insert("method".to_owned(), serde_json::Value::String(method));
    }

    payload
}

fn with_protocol_fields(
    params: serde_json::Value,
    item_id: Option<String>,
    thread_id: String,
    turn_id: String,
) -> serde_json::Value {
    let mut payload = match params {
        serde_json::Value::Object(object) => serde_json::Value::Object(object),
        value => serde_json::json!({ "params": value }),
    };

    if let Some(payload) = payload.as_object_mut() {
        if let Some(item_id) = item_id {
            payload
                .entry("itemId")
                .or_insert(serde_json::Value::String(item_id));
        }
        payload.insert(
            "protocol".to_owned(),
            serde_json::Value::String("codex_app_server".to_owned()),
        );
        payload
            .entry("threadId")
            .or_insert(serde_json::Value::String(thread_id));
        payload
            .entry("turnId")
            .or_insert(serde_json::Value::String(turn_id));
    }

    payload
}

fn extract_thread_id(result: &serde_json::Value) -> BuddyResult<String> {
    let thread = result.get("thread").unwrap_or(&serde_json::Value::Null);
    read_optional_string_field(thread, "id")
        .or_else(|| read_optional_string_field(thread, "sessionId"))
        .or_else(|| read_optional_string_field(thread, "threadId"))
        .or_else(|| read_optional_string_field(result, "threadId"))
        .or_else(|| read_optional_string_field(result, "sessionId"))
        .or_else(|| read_optional_string_field(result, "id"))
        .ok_or_else(|| {
            BuddyError::Codex("codex app-server thread response missing thread id".into())
        })
}

fn extract_turn_id(result: &serde_json::Value) -> Option<String> {
    result
        .get("turn")
        .and_then(|turn| turn.get("id"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

fn extract_final_agent_message(turn: &serde_json::Value) -> Option<CodexFinalAgentMessage> {
    let items = turn.get("items").and_then(serde_json::Value::as_array)?;
    let item = items
        .iter()
        .rev()
        .find(|item| {
            item.get("type").and_then(serde_json::Value::as_str) == Some("agentMessage")
                && item.get("phase").and_then(serde_json::Value::as_str) == Some("final_answer")
        })
        .or_else(|| {
            items.iter().rev().find(|item| {
                item.get("type").and_then(serde_json::Value::as_str) == Some("agentMessage")
            })
        })?;
    let item_id = item
        .get("id")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let phase = item
        .get("phase")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let text = item
        .get("text")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .unwrap_or_default();
    let memory_citation = item.get("memoryCitation").cloned();
    if text.is_empty() && memory_citation.is_none() {
        return None;
    }

    Some(CodexFinalAgentMessage {
        item_id,
        memory_citation,
        phase,
        text,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn create_test_text_input(text: &str) -> Vec<CodexUserInput> {
        vec![CodexUserInput::Text {
            text: text.to_owned(),
            text_elements: Vec::new(),
        }]
    }

    #[test]
    #[cfg(unix)]
    fn codex_app_server_smoke_initializes_and_starts_thread_without_turn() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-smoke-{}",
            uuid::Uuid::new_v4()
        ));
        let project_dir = temp_dir.join("project");
        fs::create_dir_all(&project_dir).expect("create project dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-smoke"}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        check_codex_app_server_smoke_with_program_and_cwd(&script_path, &project_dir)
            .expect("app-server smoke should pass");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn cleans_up_app_server_child_when_thread_start_response_is_invalid() {
        use std::{
            fs,
            os::unix::fs::PermissionsExt,
            thread,
            time::{Duration, Instant},
        };

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let pid_path = temp_dir.join("child.pid");
        let script = format!(
            r#"#!/bin/sh
echo $$ > '{}'
IFS= read -r line
printf '%s\n' '{{"id":0,"result":{{}}}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{{"id":1,"result":{{}}}}'
sleep 30
"#,
            pid_path.display()
        );
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let result = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |_| Ok(()),
        );
        let pid = fs::read_to_string(&pid_path).expect("read fake app-server pid");

        assert!(result.is_err());
        assert_process_exits(pid.trim(), Duration::from_secs(1));

        let _ = fs::remove_dir_all(temp_dir);

        fn assert_process_exits(pid: &str, timeout: Duration) {
            let proc_path = Path::new("/proc").join(pid);
            let deadline = Instant::now() + timeout;
            while proc_path.exists() && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(20));
            }

            assert!(
                !proc_path.exists(),
                "fake codex app-server process was not cleaned up"
            );
        }
    }

    #[test]
    #[cfg(unix)]
    fn streams_projected_events_from_app_server_turn() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-stream-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/reasoning/textDelta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"reasoning-1","delta":"thinking"}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"hi"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut event_types = Vec::new();
        let output = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |event| {
                event_types.push(event.event_type);

                Ok(())
            },
        )
        .expect("run fake app-server");

        assert_eq!(output.final_message, "hi");
        assert_eq!(output.thread_id, "thread-1");
        assert_eq!(output.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(
            event_types,
            vec!["reasoning.delta", "message.delta", "turn.completed"]
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn keeps_final_agent_memory_citation_out_of_final_text() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-citation-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[{"id":"message-1","type":"agentMessage","text":"done","memoryCitation":{"entries":[{"path":"MEMORY.md","lineStart":23,"lineEnd":27,"note":"used Buddy transcript event model"}],"threadIds":["thread-memory"]}}],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let output = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |_| Ok(()),
        )
        .expect("run fake app-server");

        assert_eq!(output.final_message, "done");
        assert_eq!(
            output
                .final_memory_citation
                .as_ref()
                .expect("memory citation")["entries"][0]["path"],
            "MEMORY.md"
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn prefers_completed_agent_message_over_streamed_delta_text() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-final-message-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-draft","delta":"draft <lexora_buddy_animation_intent>{\"intent\":\"celebrate\"}</lexora_buddy_animation_intent>"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[{"id":"message-final","type":"agentMessage","phase":"final_answer","text":"clean final"},{"id":"message-commentary","type":"agentMessage","phase":"commentary","text":"ignored commentary"}],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut events = Vec::new();
        let output = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |event| {
                events.push((event.event_type, event.payload.clone()));

                Ok(())
            },
        )
        .expect("run fake app-server");
        let turn_completed = events
            .iter()
            .find(|(event_type, _)| *event_type == "turn.completed")
            .expect("turn.completed event");

        assert_eq!(output.final_message, "clean final");
        assert_eq!(
            turn_completed.1["finalAgentMessage"]["itemId"],
            "message-final"
        );
        assert_eq!(
            turn_completed.1["finalAgentMessage"]["phase"],
            "final_answer"
        );
        assert_eq!(turn_completed.1["finalAgentMessage"]["text"], "clean final");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn coalesces_adjacent_app_server_delta_events() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-coalesced-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"hello"}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":" "}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"world"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut events = Vec::new();
        let output = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |event| {
                events.push((event.event_type, event.payload.clone()));

                Ok(())
            },
        )
        .expect("run fake app-server");

        let event_types = events
            .iter()
            .map(|(event_type, _)| *event_type)
            .collect::<Vec<_>>();
        assert_eq!(output.final_message, "hello world");
        assert_eq!(event_types, vec!["message.delta", "turn.completed"]);
        assert_eq!(events[0].1["delta"], "hello world");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn resumes_existing_app_server_thread_before_starting_turn() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-resume-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let request_log_path = temp_dir.join("requests.jsonl");
        let script = format!(
            r#"#!/bin/sh
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":0,"result":{{}}}}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":1,"result":{{"thread":{{"id":"thread-existing"}}}}}}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":2,"result":{{"turn":{{"id":"turn-1"}}}}}}'
printf '%s\n' '{{"method":"item/agentMessage/delta","params":{{"threadId":"thread-existing","turnId":"turn-1","itemId":"message-1","delta":"resumed"}}}}'
printf '%s\n' '{{"method":"turn/completed","params":{{"threadId":"thread-existing","turn":{{"id":"turn-1","items":[],"itemsView":{{"type":"complete"}},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}}}}'
"#,
            request_log = request_log_path.display(),
        );
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let output = run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
            &script_path,
            &create_test_text_input("hello again"),
            "/tmp",
            Some("thread-existing"),
            "message-2",
            None,
            None,
            None,
            |_| Ok(()),
            |_| Ok(CodexAppServerApprovalDecision::Accept),
        )
        .expect("run fake app-server");
        let requests = fs::read_to_string(&request_log_path).expect("read request log");

        assert_eq!(output.thread_id, "thread-existing");
        assert_eq!(output.final_message, "resumed");
        assert!(requests.contains(r#""method":"thread/resume""#));
        assert!(requests.contains(r#""threadId":"thread-existing""#));
        assert!(!requests.contains(r#""method":"thread/start""#));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn streams_modern_app_server_notifications_without_losing_unknown_methods() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-modern-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/plan/updated","params":{"threadId":"thread-1","turnId":"turn-1","explanation":"先拆协议","plan":[{"step":"检查 Codex 事件","status":"completed"},{"step":"补 Buddy 投影","status":"inProgress"}]}}'
printf '%s\n' '{"method":"item/plan/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"plan-1","delta":"检查事件"}}'
printf '%s\n' '{"method":"turn/diff/updated","params":{"threadId":"thread-1","turnId":"turn-1","diff":"diff --git a/a b/a"}}'
printf '%s\n' '{"method":"item/fileChange/patchUpdated","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"patch-1","changes":[{"path":"/tmp/a","type":"modify"}]}}'
printf '%s\n' '{"method":"item/mcpToolCall/progress","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"mcp-1","message":"reading resource"}}'
printf '%s\n' '{"id":41,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","startedAtMs":1,"command":"pnpm test","cwd":"/tmp"}}'
IFS= read -r approval_response
printf '%s\n' '{"method":"item/tool/requestUserInput","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"input-1","questions":[{"id":"mode","header":"Mode","question":"Pick one","options":[]}]}}'
printf '%s\n' '{"method":"mcpServer/startupStatus/updated","params":{"server":"docs","status":{"type":"started"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"done"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut events = Vec::new();
        run_codex_app_server_turn_with_program_and_approval_handler(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |event| {
                events.push((event.event_type, event.payload.clone()));

                Ok(())
            },
            |_| Ok(CodexAppServerApprovalDecision::Accept),
        )
        .expect("run fake app-server");

        let event_types = events
            .iter()
            .map(|(event_type, _)| *event_type)
            .collect::<Vec<_>>();
        assert_eq!(
            event_types,
            vec![
                "plan.updated",
                "plan.delta",
                "turn.diff.updated",
                "tool.patch_updated",
                "tool.progress",
                "approval.requested",
                "user_input.requested",
                "codex.notification",
                "message.delta",
                "turn.completed",
            ]
        );
        assert_eq!(
            events[7].1["method"],
            serde_json::Value::String("mcpServer/startupStatus/updated".to_owned())
        );
        assert_eq!(events[2].1["filePaths"], serde_json::json!(["a"]));
        assert_eq!(events[2].1.get("diff"), None);
        assert_eq!(events[3].1["filePaths"], serde_json::json!(["/tmp/a"]));
        assert_eq!(events[3].1.get("changes"), None);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn responds_to_supported_app_server_approval_requests() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-approval-request-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let response_path = temp_dir.join("approval-response.json");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"id":41,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","command":"pnpm test","cwd":"/tmp"}}'
IFS= read -r approval_response
printf '%s\n' "$approval_response" > '__RESPONSE_PATH__'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"approved"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#
        .replace("__RESPONSE_PATH__", &response_path.to_string_lossy());
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut events = Vec::new();
        let mut requests = Vec::new();
        let output = run_codex_app_server_turn_with_program_and_approval_handler(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |event| {
                events.push((event.event_type, event.payload.clone()));

                Ok(())
            },
            |request| {
                requests.push((
                    request.method.clone(),
                    request.request_id,
                    request.params.clone(),
                ));

                Ok(CodexAppServerApprovalDecision::Accept)
            },
        )
        .expect("run fake app-server");
        let response: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(&response_path).expect("read approval response"),
        )
        .expect("parse approval response");

        assert_eq!(output.final_message, "approved");
        assert_eq!(response["id"], 41);
        assert_eq!(response["result"]["decision"], "accept");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].0, "item/commandExecution/requestApproval");
        assert_eq!(requests[0].1, 41);
        assert_eq!(requests[0].2["command"], "pnpm test");
        assert_eq!(
            events
                .iter()
                .map(|(event_type, _)| *event_type)
                .collect::<Vec<_>>(),
            vec!["approval.requested", "message.delta", "turn.completed"]
        );
        assert_eq!(events[0].0, "approval.requested");
        assert_eq!(events[0].1["requestId"], 41);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn rejects_app_server_approval_requests_without_request_id() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-missing-approval-id-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","command":"pnpm test","cwd":"/tmp"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let error = run_codex_app_server_turn_with_program_and_approval_handler(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |_| Ok(()),
            |_| Ok(CodexAppServerApprovalDecision::Decline),
        )
        .expect_err("approval request without request id should fail");

        assert!(error
            .to_string()
            .contains("approval request missing request id"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn builds_app_server_file_change_approval_response() {
        let response = build_app_server_approval_response(
            42,
            "item/fileChange/requestApproval",
            CodexAppServerApprovalDecision::Decline,
        )
        .expect("build approval response");

        assert_eq!(response["id"], 42);
        assert_eq!(response["result"]["decision"], "decline");
    }

    #[test]
    fn builds_unsupported_approval_request_as_fail_closed_error_response() {
        let response = build_app_server_approval_response(
            43,
            "item/permissions/requestApproval",
            CodexAppServerApprovalDecision::Decline,
        )
        .expect("build approval response");

        assert_eq!(response["id"], 43);
        assert_eq!(response["error"]["code"], -32000);
        assert!(response["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("denied"));
    }

    #[test]
    fn builds_app_server_initialize_request() {
        let request = build_app_server_initialize_request(7);

        assert_eq!(request["id"], 7);
        assert_eq!(request["method"], "initialize");
        assert_eq!(request["params"]["capabilities"]["experimentalApi"], true);
        assert_eq!(
            request["params"]["capabilities"]["optOutNotificationMethods"],
            serde_json::json!([
                "account/updated",
                "thread/settings/updated",
                "thread/tokenUsage/updated"
            ])
        );
        assert_eq!(request["params"]["clientInfo"]["name"], "lexora_buddy");
        assert_eq!(request["params"]["clientInfo"]["title"], "Lexora");
    }

    #[test]
    fn builds_persistent_workspace_write_app_server_thread_start_request() {
        let request =
            build_app_server_thread_start_request(8, "/tmp/lexora-buddy", Some("context pack"));

        assert_eq!(request["id"], 8);
        assert_eq!(request["method"], "thread/start");
        assert_eq!(request["params"]["cwd"], "/tmp/lexora-buddy");
        assert_eq!(request["params"]["developerInstructions"], "context pack");
        assert_eq!(request["params"]["ephemeral"], false);
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(
            request["params"]["runtimeWorkspaceRoots"][0],
            "/tmp/lexora-buddy"
        );
        assert_eq!(request["params"]["sandbox"], "workspace-write");
    }

    #[test]
    fn builds_ephemeral_app_server_smoke_thread_start_request() {
        let request = build_app_server_smoke_thread_start_request(9, "/tmp/lexora-buddy");

        assert_eq!(request["id"], 9);
        assert_eq!(request["method"], "thread/start");
        assert_eq!(request["params"]["ephemeral"], true);
    }

    #[test]
    fn builds_app_server_thread_resume_request_with_workspace_overrides() {
        let request = build_app_server_thread_resume_request(
            10,
            "thread-existing",
            "/tmp/lexora-buddy",
            None,
        );

        assert_eq!(request["id"], 10);
        assert_eq!(request["method"], "thread/resume");
        assert_eq!(request["params"]["threadId"], "thread-existing");
        assert_eq!(request["params"]["cwd"], "/tmp/lexora-buddy");
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(
            request["params"]["runtimeWorkspaceRoots"][0],
            "/tmp/lexora-buddy"
        );
        assert_eq!(request["params"]["sandbox"], "workspace-write");
        assert_eq!(request["params"].get("ephemeral"), None);
    }

    #[test]
    fn extracts_thread_id_from_known_app_server_thread_start_shapes() {
        assert_eq!(
            extract_thread_id(&serde_json::json!({"thread": {"id": "thread-a"}}))
                .expect("thread.id"),
            "thread-a"
        );
        assert_eq!(
            extract_thread_id(&serde_json::json!({"thread": {"sessionId": "thread-b"}}))
                .expect("thread.sessionId"),
            "thread-b"
        );
        assert_eq!(
            extract_thread_id(&serde_json::json!({"sessionId": "thread-c"}))
                .expect("result.sessionId"),
            "thread-c"
        );
        assert_eq!(
            extract_thread_id(&serde_json::json!({"threadId": "thread-d"}))
                .expect("result.threadId"),
            "thread-d"
        );
    }

    #[test]
    fn builds_app_server_turn_start_request_with_text_input() {
        let input = vec![
            CodexUserInput::Text {
                text: "hello".to_owned(),
                text_elements: Vec::new(),
            },
            CodexUserInput::Skill {
                name: "lexora-buddy".to_owned(),
                path: "/tmp/lexora-buddy/SKILL.md".to_owned(),
            },
            CodexUserInput::Mention {
                name: "BuddyChatComposer.vue".to_owned(),
                path: "/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
            },
            CodexUserInput::Image {
                detail: Some("auto".to_owned()),
                url: "data:image/png;base64,abc".to_owned(),
            },
        ];
        let model_selection = CodexModelSelection {
            effort: Some("high".to_owned()),
            model: Some("gpt-test".to_owned()),
            service_tier: Some("flex".to_owned()),
        };
        let request = build_app_server_turn_start_request(
            9,
            "thread-1",
            "message-1",
            &input,
            "/tmp/cwd",
            Some(&model_selection),
        );

        assert_eq!(request["id"], 9);
        assert_eq!(request["method"], "turn/start");
        assert_eq!(request["params"]["threadId"], "thread-1");
        assert_eq!(request["params"]["clientUserMessageId"], "message-1");
        assert_eq!(request["params"]["cwd"], "/tmp/cwd");
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(request["params"]["runtimeWorkspaceRoots"][0], "/tmp/cwd");
        assert_eq!(request["params"]["model"], "gpt-test");
        assert_eq!(request["params"]["serviceTier"], "flex");
        assert_eq!(request["params"]["effort"], "high");
        assert_eq!(request["params"]["sandboxPolicy"]["type"], "workspaceWrite");
        assert_eq!(
            request["params"]["sandboxPolicy"]["writableRoots"][0],
            "/tmp/cwd"
        );
        assert_eq!(request["params"]["sandboxPolicy"]["networkAccess"], false);
        assert_eq!(request["params"]["input"][0]["type"], "text");
        assert_eq!(request["params"]["input"][0]["text"], "hello");
        assert_eq!(request["params"]["input"][1]["type"], "skill");
        assert_eq!(request["params"]["input"][1]["name"], "lexora-buddy");
        assert_eq!(request["params"]["input"][2]["type"], "mention");
        assert_eq!(
            request["params"]["input"][2]["path"],
            "/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue"
        );
        assert_eq!(request["params"]["input"][3]["type"], "image");
        assert_eq!(request["params"]["input"][3]["detail"], "auto");
        assert_eq!(
            request["params"]["input"][3]["url"],
            "data:image/png;base64,abc"
        );
        assert_eq!(
            request["params"]["input"][0]["text_elements"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }

    #[test]
    fn extracts_model_options_from_app_server_response() {
        let models = extract_codex_model_options(&serde_json::json!({
            "data": [
                {
                    "id": "hidden-model",
                    "model": "hidden-model",
                    "displayName": "Hidden",
                    "description": "Hidden",
                    "hidden": true,
                    "supportedReasoningEfforts": [],
                    "defaultReasoningEffort": "medium",
                    "serviceTiers": [],
                    "defaultServiceTier": null,
                    "isDefault": false
                },
                {
                    "id": "gpt-5.5",
                    "model": "gpt-5.5",
                    "displayName": "GPT-5.5",
                    "description": "Default model",
                    "hidden": false,
                    "supportedReasoningEfforts": [
                        {
                            "reasoningEffort": "low",
                            "description": "Low reasoning"
                        },
                        {
                            "reasoningEffort": "high",
                            "description": "High reasoning"
                        }
                    ],
                    "defaultReasoningEffort": "high",
                    "serviceTiers": [
                        {
                            "id": "standard",
                            "name": "Standard",
                            "description": "Default speed"
                        },
                        {
                            "id": "fast",
                            "name": "Fast",
                            "description": "Fast responses"
                        }
                    ],
                    "defaultServiceTier": "standard",
                    "isDefault": true
                }
            ],
            "nextCursor": null
        }));

        assert_eq!(models.len(), 1);
        assert_eq!(models[0].runtime, "codex");
        assert_eq!(models[0].display_name, "GPT-5.5");
        assert_eq!(models[0].default_reasoning_effort.as_deref(), Some("high"));
        assert_eq!(
            models[0].supported_reasoning_efforts[0].reasoning_effort,
            "low"
        );
        assert_eq!(models[0].service_tiers[1].name, "Fast");
        assert_eq!(models[0].default_service_tier.as_deref(), Some("standard"));
        assert!(models[0].is_default);
    }

    #[test]
    fn extracts_prompt_context_options_from_app_server_responses() {
        let skills = extract_prompt_context_skills(&serde_json::json!({
            "data": [{
                "cwd": "/tmp/Lexora",
                "skills": [{
                    "name": "lexora-buddy",
                    "description": "Buddy runtime",
                    "path": "/tmp/Lexora/.agents/skills/lexora-buddy/SKILL.md",
                    "enabled": true,
                    "interface": {
                        "shortDescription": "处理 Buddy 本地运行时"
                    }
                }],
                "errors": []
            }]
        }));
        let plugins = extract_prompt_context_plugins(&serde_json::json!({
            "marketplaces": [{
                "plugins": [{
                    "id": "browser",
                    "name": "browser",
                    "installed": true,
                    "enabled": true,
                    "interface": {
                        "displayName": "Browser",
                        "shortDescription": "Control the in-app browser"
                    }
                }]
            }]
        }));
        let files = extract_prompt_context_files(
            &serde_json::json!({
                "files": [{
                    "root": "/tmp/Lexora",
                    "path": "apps/buddy/src/chat/BuddyChatComposer.vue",
                    "file_name": "BuddyChatComposer.vue"
                }]
            }),
            "/tmp/Lexora",
        );

        assert_eq!(skills[0].kind, "skill");
        assert_eq!(skills[0].value, "lexora-buddy");
        assert_eq!(
            skills[0].description.as_deref(),
            Some("处理 Buddy 本地运行时")
        );
        assert_eq!(plugins[0].label, "Browser");
        assert_eq!(plugins[0].value, "browser");
        assert_eq!(
            files[0].path.as_deref(),
            Some("/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue")
        );
    }

    #[test]
    fn parses_app_server_delta_and_completion_notifications() {
        let delta = parse_app_server_message(
            r#"{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"item-1","delta":"hi"}}"#,
        )
        .expect("parse delta");
        let completed = parse_app_server_message(
            r#"{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}"#,
        )
        .expect("parse completion");

        assert!(matches!(
            delta,
            CodexAppServerMessage::AgentMessageDelta { delta, .. } if delta == "hi"
        ));
        assert!(matches!(
            completed,
            CodexAppServerMessage::TurnCompleted { turn_id, .. } if turn_id == "turn-1"
        ));
    }

    #[test]
    fn parses_app_server_requests_before_responses() {
        let approval = parse_app_server_message(
            r#"{"id":41,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","command":"pnpm test"}}"#,
        )
        .expect("parse approval request");
        let user_input = parse_app_server_message(
            r#"{"id":42,"method":"item/tool/requestUserInput","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"input-1","questions":[{"id":"mode","question":"Pick one"}]}}"#,
        )
        .expect("parse user input request");

        assert!(matches!(
            approval,
            CodexAppServerMessage::ApprovalRequested {
                request_id: Some(41),
                item_id,
                ..
            } if item_id == "cmd-1"
        ));
        assert!(matches!(
            user_input,
            CodexAppServerMessage::UserInputRequested {
                request_id: Some(42),
                item_id,
                ..
            } if item_id == "input-1"
        ));
    }

    #[test]
    fn parses_structured_app_server_error_notifications() {
        let message = parse_app_server_message(
            r#"{"method":"error","params":{"error":{"message":"usage limit exceeded","codexErrorInfo":"usageLimitExceeded"},"threadId":"thread-1","turnId":"turn-1","willRetry":false}}"#,
        )
        .expect("parse error notification");
        let fallback_message = parse_app_server_message(
            r#"{"method":"error","params":{"error":{"codexErrorInfo":"usageLimitExceeded"},"threadId":"thread-1","turnId":"turn-1","willRetry":false}}"#,
        )
        .expect("parse fallback error notification");

        assert!(matches!(
            message,
            CodexAppServerMessage::ErrorNotification { message } if message == "usage limit exceeded"
        ));
        assert!(matches!(
            fallback_message,
            CodexAppServerMessage::ErrorNotification { message } if message == "usage limit exceeded"
        ));
    }

    #[test]
    fn parses_failed_turn_completion_error_message() {
        let completed = parse_app_server_message(
            r#"{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"failed","error":{"message":"server overloaded","codexErrorInfo":"serverOverloaded"},"startedAt":1,"completedAt":2,"durationMs":1000}}}"#,
        )
        .expect("parse failed completion");

        assert!(matches!(
            completed,
            CodexAppServerMessage::TurnCompleted {
                error_message: Some(message),
                status,
                ..
            } if message == "server overloaded" && status == "failed"
        ));
    }

    #[test]
    #[cfg(unix)]
    fn failed_turn_completion_returns_error() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-failed-turn-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"failed","error":{"message":"server overloaded","codexErrorInfo":"serverOverloaded"},"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let error = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |_| Ok(()),
        )
        .expect_err("failed turn should fail the run");

        assert!(error
            .to_string()
            .contains("codex app-server turn failed: server overloaded"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn includes_redacted_stderr_tail_when_app_server_closes_transport() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-stderr-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
printf '%s\n' 'auth failed: OPENAI_API_KEY=sk-test-secret' >&2
printf '%s\n' 'Authorization: Bearer live-token' >&2
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
exit 1
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let error = run_codex_app_server_turn_with_program(
            &script_path,
            &create_test_text_input("hello"),
            "/tmp",
            "message-1",
            None,
            None,
            |_| Ok(()),
        )
        .expect_err("closed transport should fail");
        let message = error.to_string();

        assert!(message.contains("codex app-server closed the transport"));
        assert!(message.contains("stderr tail:"));
        assert!(message.contains("OPENAI_API_KEY=[redacted]"));
        assert!(message.contains("Authorization: Bearer [redacted]"));
        assert!(!message.contains("sk-test-secret"));
        assert!(!message.contains("live-token"));

        let _ = fs::remove_dir_all(temp_dir);
    }
}
