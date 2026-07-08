use crate::{
    domain::BuddyRunTerminalStatus,
    error::BuddyError,
    storage::{BuddyFinishedRun, BuddyStorage},
};

use super::super::{
    run_state::{is_buddy_run_cancelled, BuddyRunCancellationToken, BuddyRunStateEventPublisher},
    runtime_events::create_runtime_error_memory_eligibility_payload,
};

pub(super) fn record_codex_run_failure(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    message: String,
) -> Result<BuddyFinishedRun, BuddyError> {
    storage.finish_run(
        run_id.to_owned(),
        BuddyRunTerminalStatus::Failed,
        serde_json::json!({
            "approvalId": approval_id,
            "message": message,
            "protocol": protocol,
        }),
    )
}

pub(in crate::commands) fn record_codex_run_cancelled(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
) -> Result<BuddyFinishedRun, BuddyError> {
    storage.finish_run(
        run_id.to_owned(),
        BuddyRunTerminalStatus::Cancelled,
        serde_json::json!({
            "approvalId": approval_id,
            "protocol": protocol,
            "reason": "user_cancelled",
        }),
    )
}

pub(super) fn abort_if_buddy_run_cancelled(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    cancellation: Option<&BuddyRunCancellationToken>,
    event_publisher: &BuddyRunStateEventPublisher,
) -> Result<(), BuddyError> {
    if !is_buddy_run_cancelled(cancellation) {
        return Ok(());
    }

    let finished_run = record_codex_run_cancelled(storage, run_id, approval_id, protocol)?;
    event_publisher.emit_finished_run(&finished_run);
    Err(BuddyError::Runtime("run cancelled".to_owned()))
}

pub(super) fn record_codex_runtime_error_state(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    cancellation: Option<&BuddyRunCancellationToken>,
    event_publisher: &BuddyRunStateEventPublisher,
    error_message: &str,
) -> Result<(), BuddyError> {
    if is_buddy_run_cancelled(cancellation) {
        let finished_run = record_codex_run_cancelled(storage, run_id, approval_id, protocol)?;
        event_publisher.emit_finished_run(&finished_run);
        return Ok(());
    }

    match storage.finish_run(
        run_id.to_owned(),
        BuddyRunTerminalStatus::Failed,
        serde_json::json!({
            "approvalId": approval_id,
            "memoryEligibility": create_runtime_error_memory_eligibility_payload(),
            "message": error_message,
            "protocol": protocol,
        }),
    ) {
        Ok(finished_run) => event_publisher.emit_finished_run(&finished_run),
        Err(record_error) => {
            return Err(BuddyError::Runtime(format!(
                "{error_message}; failed to record run failure: {record_error}"
            )));
        }
    }

    Ok(())
}
