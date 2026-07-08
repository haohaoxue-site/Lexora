use crate::error::{BuddyError, BuddyResult};

use super::{
    messages::{parse_app_server_message, CodexAppServerMessage},
    transport::CodexAppServerTransport,
};

pub(super) fn read_app_server_response(
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

pub(super) enum CodexAppServerResponseResult {
    Error(String),
    Result(serde_json::Value),
}

pub(super) fn read_app_server_response_result(
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
