use crate::error::{BuddyError, BuddyResult};

use super::{
    messages::{
        is_codex_tool_item, is_unknown_app_server_error, summarize_app_server_error_context,
        CodexAppServerMessage,
    },
    projection::{
        count_patch_changes, summarize_patch_change_file_paths, summarize_unified_diff_file_paths,
        with_method_and_protocol_fields, with_protocol_fields,
    },
    requests::{build_app_server_approval_response, build_app_server_request_error_response},
    transport::CodexAppServerTransport,
    CodexAppServerApprovalDecision, CodexAppServerApprovalRequest, CodexAppServerOutput,
    CodexAppServerProjectedEvent,
};

const CODEX_APP_SERVER_DELTA_FLUSH_CHAR_LIMIT: usize = 160;
const CODEX_APP_SERVER_DELTA_FLUSH_CHUNK_LIMIT: usize = 8;

#[derive(Default)]
pub(super) struct CodexAppServerTurnProjectionState {
    delta_buffer: CodexAppServerDeltaBuffer,
    final_memory_citation: Option<serde_json::Value>,
    final_message: String,
    last_error_context: Option<String>,
    turn_start_request_id: i64,
    turn_id: Option<String>,
}

impl CodexAppServerTurnProjectionState {
    pub(super) fn new(turn_start_request_id: i64) -> Self {
        Self {
            turn_start_request_id,
            ..Default::default()
        }
    }

    pub(super) fn flush<F>(&mut self, on_projected_event: &mut F) -> BuddyResult<()>
    where
        F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    {
        self.delta_buffer.flush(on_projected_event)
    }

    pub(super) fn into_output(self, thread_id: String) -> CodexAppServerOutput {
        CodexAppServerOutput {
            final_memory_citation: self.final_memory_citation,
            final_message: self.final_message.trim().to_owned(),
            thread_id,
            turn_id: self.turn_id,
        }
    }
}

pub(super) enum CodexAppServerTurnMessageOutcome {
    CloseWithError(BuddyError),
    Continue,
    Completed,
}

pub(super) fn handle_codex_app_server_turn_message<F, A>(
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

fn extract_turn_id(result: &serde_json::Value) -> Option<String> {
    result
        .get("turn")
        .and_then(|turn| turn.get("id"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}
