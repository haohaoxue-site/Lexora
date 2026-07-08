use crate::{
    agents::codex,
    domain::BuddyAvailableRuntimeProtocol,
    error::BuddyError,
    memory,
    storage::{BuddyRun, BuddyRunEvent, BuddyStorage, CreateBuddyRunEventRequest},
};

use super::{
    super::{
        approval::wait_for_codex_app_server_approval,
        run_state::{BuddyRunCancellationToken, BuddyRunStateEventPublisher},
        runtime_events::CodexRuntimeOutput,
    },
    terminal_state::record_codex_runtime_error_state,
    BuddyCodexRunTarget,
};

pub(super) struct CodexRuntimeRunRequest<'a> {
    pub(super) approval_id: Option<&'a str>,
    pub(super) runtime_cwd: &'a str,
    pub(super) runtime_instructions_content: Option<&'a str>,
    pub(super) cancellation: Option<BuddyRunCancellationToken>,
    pub(super) event_publisher: &'a BuddyRunStateEventPublisher,
    pub(super) content: &'a str,
    pub(super) input: &'a [codex::CodexUserInput],
    pub(super) model_selection: Option<&'a codex::CodexModelSelection>,
    pub(super) existing_thread_id: Option<&'a str>,
    pub(super) protocol: BuddyAvailableRuntimeProtocol,
    pub(super) run_id: &'a str,
    pub(super) target: &'a BuddyCodexRunTarget,
    pub(super) storage: &'a BuddyStorage,
    pub(super) user_message_id: &'a str,
}

pub(super) struct CodexRuntimeRunResult {
    pub(super) output: CodexRuntimeOutput,
    pub(super) projected_events: Vec<BuddyRunEvent>,
    pub(super) run: Option<BuddyRun>,
}

pub(super) fn run_codex_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    match request.protocol {
        BuddyAvailableRuntimeProtocol::CodexAppServer => run_codex_app_server_runtime(request),
        BuddyAvailableRuntimeProtocol::CodexExecJsonFallback => run_codex_exec_runtime(request),
    }
}

fn run_codex_app_server_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    let mut projected_events = Vec::new();
    let run_id = request.run_id.to_owned();
    let approval_cancellation = request.cancellation.clone();
    let output = match codex::run_codex_app_server_turn_with_cancellation_and_approval_handler(
        codex::CodexAppServerTurnRequest {
            input: request.input,
            cwd: request.runtime_cwd,
            existing_thread_id: request.existing_thread_id,
            client_user_message_id: request.user_message_id,
            context_pack: request.runtime_instructions_content,
            model_selection: request.model_selection,
            cancellation: request.cancellation.clone(),
        },
        |projected_event| {
            let event = request
                .storage
                .append_run_event(CreateBuddyRunEventRequest::projected(
                    run_id.clone(),
                    projected_event.event_type,
                    projected_event.payload.clone(),
                ))?;
            request.event_publisher.emit_event(&event, None);
            projected_events.push(event);

            Ok(())
        },
        |approval_request| {
            wait_for_codex_app_server_approval(
                request.storage,
                &run_id,
                request.runtime_cwd,
                approval_request,
                approval_cancellation.as_ref(),
            )
        },
    ) {
        Ok(output) => output,
        Err(error) => {
            let error_message = error.to_string();
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };
    let run = match request
        .storage
        .update_run_external_refs(
            request.run_id.to_owned(),
            Some(output.thread_id.clone()),
            output.turn_id.clone(),
        )
        .and_then(|run| {
            request.target.upsert_codex_runtime_binding(
                request.storage,
                request.runtime_cwd,
                output.thread_id.clone(),
            )?;

            Ok(run)
        }) {
        Ok(run) => run,
        Err(error) => {
            let error_message = error.to_string();
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };

    Ok(CodexRuntimeRunResult {
        output: CodexRuntimeOutput {
            final_memory_citation: output.final_memory_citation,
            final_message: output.final_message,
            protocol: request.protocol.as_str(),
            stdout_bytes: None,
            thread_id: Some(output.thread_id),
            turn_id: output.turn_id,
        },
        projected_events,
        run: Some(run),
    })
}

fn run_codex_exec_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    let output_path = codex::create_codex_output_path(request.run_id);
    let prompt = memory::compose_prompt_with_context_pack(
        request.content,
        request.runtime_instructions_content,
    );
    let codex_output = match codex::run_codex_exec_with_cancellation(
        &prompt,
        &output_path,
        Some(request.runtime_cwd),
        request.cancellation.clone(),
    ) {
        Ok(output) => output,
        Err(error) => {
            let error_message = error.to_string();
            let _ = std::fs::remove_file(&output_path);
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };
    let _ = std::fs::remove_file(&output_path);

    Ok(CodexRuntimeRunResult {
        output: CodexRuntimeOutput {
            final_memory_citation: None,
            final_message: codex_output.final_message,
            protocol: request.protocol.as_str(),
            stdout_bytes: Some(codex_output.stdout.len()),
            thread_id: None,
            turn_id: None,
        },
        projected_events: Vec::new(),
        run: None,
    })
}
