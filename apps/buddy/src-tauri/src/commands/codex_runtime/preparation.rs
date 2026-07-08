use std::path::Path;

use crate::{
    agents::codex,
    context_pack,
    domain::{
        BuddyAvailableRuntimeProtocol, BuddyRunEventType, BuddyRunStatus, BuddyRuntime,
        BuddyRuntimeProtocol,
    },
    error::BuddyError,
    intent::BuddyIntentDecision,
    storage::{BuddyRun, BuddyRunEvent, BuddyStorage, CreateBuddyRunEventRequest},
};

use super::{
    context::{prepare_codex_run_context, PrepareCodexRunContextRequest, PreparedCodexRunContext},
    terminal_state::{abort_if_buddy_run_cancelled, record_codex_runtime_error_state},
    BuddyCodexRunTarget,
};
use crate::commands::{
    run_state::{BuddyRunCancellationToken, BuddyRunStateEventPublisher},
    runtime_events::create_memory_context_pack_event_payload,
};

pub(super) struct PreparedCodexRuntimeRun {
    pub(super) context: PreparedCodexRunContext,
    pub(super) events: Vec<BuddyRunEvent>,
    pub(super) protocol: BuddyAvailableRuntimeProtocol,
    pub(super) run: BuddyRun,
}

pub(super) struct PrepareCodexRuntimeRunRequest<'a> {
    pub(super) storage: &'a BuddyStorage,
    pub(super) approval_id: Option<&'a str>,
    pub(super) attachment_count: usize,
    pub(super) runtime_cwd: &'a str,
    pub(super) run: BuddyRun,
    pub(super) memory_root: &'a Path,
    pub(super) target: &'a BuddyCodexRunTarget,
    pub(super) source_project: Option<&'a str>,
    pub(super) intent_decision: &'a BuddyIntentDecision,
    pub(super) selected_context: &'a [context_pack::BuddyContextPackSelectedContextItem],
    pub(super) model_selection: Option<&'a codex::CodexModelSelection>,
    pub(super) cancellation: Option<&'a BuddyRunCancellationToken>,
    pub(super) event_publisher: &'a BuddyRunStateEventPublisher,
    pub(super) user_message_id: &'a str,
}

pub(super) fn prepare_codex_runtime_run(
    request: PrepareCodexRuntimeRunRequest<'_>,
) -> Result<PreparedCodexRuntimeRun, BuddyError> {
    let mut run = request.run;
    let protocol = select_codex_runtime_protocol(
        request.storage,
        &run.id,
        request.approval_id,
        request.event_publisher,
    )?;
    abort_if_buddy_run_cancelled(
        request.storage,
        &run.id,
        request.approval_id,
        protocol.as_str(),
        request.cancellation,
        request.event_publisher,
    )?;
    let context = prepare_codex_run_context(PrepareCodexRunContextRequest {
        storage: request.storage,
        memory_root: request.memory_root,
        run_id: &run.id,
        target: request.target,
        runtime_cwd: request.runtime_cwd,
        source_project: request.source_project,
        intent_decision: request.intent_decision,
        selected_context: request.selected_context,
    })?;
    run = request
        .storage
        .update_run_status(run.id.clone(), BuddyRunStatus::Running)?;
    request.event_publisher.emit_run(&run);
    abort_if_buddy_run_cancelled(
        request.storage,
        &run.id,
        request.approval_id,
        protocol.as_str(),
        request.cancellation,
        request.event_publisher,
    )?;

    let events = append_codex_run_start_events(CodexRunStartEventsRequest {
        storage: request.storage,
        run_id: &run.id,
        approval_id: request.approval_id,
        attachment_count: request.attachment_count,
        runtime_cwd: request.runtime_cwd,
        model_selection: request.model_selection,
        protocol,
        user_message_id: request.user_message_id,
        context_pack_diagnostic: &context.context_pack_diagnostic,
    })?;
    request
        .event_publisher
        .emit_events(&events, request.target.event_session_id());

    Ok(PreparedCodexRuntimeRun {
        context,
        events,
        protocol,
        run,
    })
}

fn select_codex_runtime_protocol(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    event_publisher: &BuddyRunStateEventPublisher,
) -> Result<BuddyAvailableRuntimeProtocol, BuddyError> {
    let runtime_status = codex::detect_codex_runtime_status();
    if runtime_status.app_server_available {
        return Ok(BuddyAvailableRuntimeProtocol::CodexAppServer);
    }
    if runtime_status.exec_json_available {
        return Ok(BuddyAvailableRuntimeProtocol::CodexExecJsonFallback);
    }

    record_codex_runtime_error_state(
        storage,
        run_id,
        approval_id,
        BuddyRuntimeProtocol::Unavailable.as_str(),
        None,
        event_publisher,
        "codex runtime is unavailable",
    )?;
    Err(BuddyError::Codex("codex runtime is unavailable".to_owned()))
}

struct CodexRunStartEventsRequest<'a> {
    storage: &'a BuddyStorage,
    run_id: &'a str,
    approval_id: Option<&'a str>,
    attachment_count: usize,
    runtime_cwd: &'a str,
    model_selection: Option<&'a codex::CodexModelSelection>,
    protocol: BuddyAvailableRuntimeProtocol,
    user_message_id: &'a str,
    context_pack_diagnostic: &'a context_pack::BuddyContextPackDiagnostic,
}

fn append_codex_run_start_events(
    request: CodexRunStartEventsRequest<'_>,
) -> Result<Vec<BuddyRunEvent>, BuddyError> {
    let mut events = vec![request.storage.append_run_event(
        CreateBuddyRunEventRequest::new(
            request.run_id,
            BuddyRunEventType::RunStarted,
            serde_json::json!({
                "approvalId": request.approval_id,
                "attachmentCount": request.attachment_count,
                "runtime": BuddyRuntime::Codex.as_str(),
                "cwd": request.runtime_cwd,
                "effort": request.model_selection.and_then(|selection| selection.effort.as_deref()),
                "model": request.model_selection.and_then(|selection| selection.model.as_deref()),
                "protocol": request.protocol.as_str(),
                "serviceTier": request.model_selection.and_then(|selection| selection.service_tier.as_deref()),
                "userMessageId": request.user_message_id,
            }),
        ),
    )?];
    events.push(
        request
            .storage
            .append_run_event(CreateBuddyRunEventRequest::new(
                request.run_id,
                BuddyRunEventType::MemoryContextPack,
                create_memory_context_pack_event_payload(request.context_pack_diagnostic),
            ))?,
    );

    Ok(events)
}
