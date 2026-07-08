use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};

use crate::error::BuddyResult;

use super::{
    CodexAppServerOutput, CodexAppServerProjectedEvent, CodexModelOption, CodexModelSelection,
    CodexPromptContextOptions, CodexUserInput,
};

mod events;
mod messages;
mod options;
mod projection;
mod requests;
mod rpc;
mod transport;
mod turn;

use options::{
    load_codex_model_options as load_codex_model_options_from_app_server,
    load_codex_prompt_context_options as load_codex_prompt_context_options_from_app_server,
};

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

pub struct CodexAppServerTurnRequest<'a> {
    pub input: &'a [CodexUserInput],
    pub cwd: &'a str,
    pub existing_thread_id: Option<&'a str>,
    pub client_user_message_id: &'a str,
    pub context_pack: Option<&'a str>,
    pub model_selection: Option<&'a CodexModelSelection>,
    pub cancellation: Option<Arc<AtomicBool>>,
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
    request: CodexAppServerTurnRequest<'_>,
    on_projected_event: F,
    on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    turn::run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        Path::new("codex"),
        request,
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
    turn::run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        program,
        CodexAppServerTurnRequest {
            input,
            cwd,
            existing_thread_id: None,
            client_user_message_id,
            context_pack,
            model_selection,
            cancellation: None,
        },
        on_projected_event,
        |request| {
            Err(crate::error::BuddyError::Codex(format!(
                "codex app-server requested unsupported interaction: {}",
                request.method
            )))
        },
    )
}

#[cfg(test)]
fn run_codex_app_server_turn_with_program_and_approval_handler<F, A>(
    program: &Path,
    request: CodexAppServerTurnRequest<'_>,
    on_projected_event: F,
    on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    turn::run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        program,
        request,
        on_projected_event,
        on_approval_request,
    )
}

#[cfg(test)]
fn run_codex_app_server_turn_with_program_cancellation_and_approval_handler<F, A>(
    program: &Path,
    request: CodexAppServerTurnRequest<'_>,
    on_projected_event: F,
    on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    turn::run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        program,
        request,
        on_projected_event,
        on_approval_request,
    )
}

pub fn load_codex_prompt_context_options(
    cwd: &str,
    file_query: Option<&str>,
) -> BuddyResult<CodexPromptContextOptions> {
    load_codex_prompt_context_options_from_app_server(cwd, file_query)
}

pub fn load_codex_model_options() -> BuddyResult<Vec<CodexModelOption>> {
    load_codex_model_options_from_app_server()
}

pub fn check_codex_app_server_smoke() -> BuddyResult<()> {
    let cwd = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-smoke-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&cwd)?;
    let result = turn::check_codex_app_server_smoke_with_program_and_cwd(Path::new("codex"), &cwd);
    let _ = std::fs::remove_dir_all(cwd);

    result
}

#[cfg(test)]
fn check_codex_app_server_smoke_with_program_and_cwd(
    program: &Path,
    cwd: &Path,
) -> BuddyResult<()> {
    turn::check_codex_app_server_smoke_with_program_and_cwd(program, cwd)
}

#[cfg(test)]
fn extract_thread_id(result: &serde_json::Value) -> BuddyResult<String> {
    turn::extract_thread_id(result)
}

#[cfg(test)]
mod tests;
