use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use crate::error::{BuddyError, BuddyResult};

use super::{
    events::{
        handle_codex_app_server_turn_message, CodexAppServerTurnMessageOutcome,
        CodexAppServerTurnProjectionState,
    },
    messages::{parse_app_server_message, read_optional_string_field},
    requests::{
        build_app_server_initialize_request, build_app_server_initialized_notification,
        build_app_server_smoke_thread_start_request, build_app_server_thread_resume_request,
        build_app_server_thread_start_request, build_app_server_turn_start_request,
    },
    rpc::{
        read_app_server_response, read_app_server_response_result, CodexAppServerResponseResult,
    },
    transport::CodexAppServerTransport,
    CodexAppServerApprovalDecision, CodexAppServerApprovalRequest, CodexAppServerOutput,
    CodexAppServerProjectedEvent, CodexAppServerTurnRequest,
};

pub(super) fn run_codex_app_server_turn_with_program_cancellation_and_approval_handler<F, A>(
    program: &Path,
    request: CodexAppServerTurnRequest<'_>,
    mut on_projected_event: F,
    mut on_approval_request: A,
) -> BuddyResult<CodexAppServerOutput>
where
    F: FnMut(&CodexAppServerProjectedEvent) -> BuddyResult<()>,
    A: FnMut(&CodexAppServerApprovalRequest) -> BuddyResult<CodexAppServerApprovalDecision>,
{
    let mut transport = CodexAppServerTransport::spawn(program)?;
    let _cancellation_watcher = request
        .cancellation
        .as_ref()
        .map(|cancellation| transport.spawn_cancellation_watcher(Arc::clone(cancellation)));

    abort_if_app_server_turn_cancelled(request.cancellation.as_ref())?;
    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    abort_if_app_server_turn_cancelled(request.cancellation.as_ref())?;
    transport.send(build_app_server_initialized_notification())?;
    let thread = start_or_resume_app_server_thread(
        &mut transport,
        request.existing_thread_id,
        request.cwd,
        request.context_pack,
    )?;

    abort_if_app_server_turn_cancelled(request.cancellation.as_ref())?;
    transport.send(build_app_server_turn_start_request(
        thread.turn_start_request_id,
        &thread.thread_id,
        request.client_user_message_id,
        request.input,
        request.cwd,
        request.model_selection,
    ))?;

    let mut turn_state = CodexAppServerTurnProjectionState::new(thread.turn_start_request_id);

    loop {
        abort_if_app_server_turn_cancelled(request.cancellation.as_ref())?;
        let line = transport.read_line()?;
        abort_if_app_server_turn_cancelled(request.cancellation.as_ref())?;
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

    turn_state.flush(&mut on_projected_event)?;
    transport.close();

    Ok(turn_state.into_output(thread.thread_id))
}

pub(super) fn check_codex_app_server_smoke_with_program_and_cwd(
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

pub(super) fn extract_thread_id(result: &serde_json::Value) -> BuddyResult<String> {
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
