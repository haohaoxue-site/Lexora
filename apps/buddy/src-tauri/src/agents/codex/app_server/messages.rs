use crate::error::{BuddyError, BuddyResult};

#[derive(Debug)]
pub(super) struct CodexFinalAgentMessage {
    pub(super) item_id: Option<String>,
    pub(super) memory_citation: Option<serde_json::Value>,
    pub(super) phase: Option<String>,
    pub(super) text: String,
}

#[derive(Debug)]
pub(super) enum CodexAppServerMessage {
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

pub(super) fn parse_app_server_message(line: &str) -> BuddyResult<CodexAppServerMessage> {
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

pub(super) fn is_codex_tool_item(item: &serde_json::Value) -> bool {
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

pub(super) fn read_optional_string_field(value: &serde_json::Value, field: &str) -> Option<String> {
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
    object.keys().next().map(describe_codex_error_code)
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

pub(super) fn is_unknown_app_server_error(message: &str) -> bool {
    message
        .trim()
        .eq_ignore_ascii_case("unknown app-server error")
}

pub(super) fn summarize_app_server_error_context(
    method: &str,
    params: &serde_json::Value,
) -> Option<String> {
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
    use super::*;

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
}
