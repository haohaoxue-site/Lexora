use rusqlite::Connection;

use crate::error::{BuddyError, BuddyResult};

use super::{
    approvals::{self, BuddyApproval},
    messages::{self, BuddyMessage},
    run_events,
    run_events::{BuddyRunEvent, CreateBuddyRunEventRequest},
    runs::{self, BuddyRun},
};

const READ_ONLY_TASK_APPROVAL_KIND: &str = "run.read_only_task";

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyReadOnlyTaskApprovalPlan {
    pub approval: BuddyApproval,
    pub event: BuddyRunEvent,
    pub message: BuddyMessage,
    pub run: BuddyRun,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyReadOnlyTaskDenial {
    pub approval: BuddyApproval,
    pub events: Vec<BuddyRunEvent>,
    pub run: BuddyRun,
}

pub fn approve_read_only_task_approval(
    connection: &mut Connection,
    approval_id: String,
) -> BuddyResult<BuddyReadOnlyTaskApprovalPlan> {
    let transaction = connection.transaction()?;
    let pending_approval = find_pending_read_only_task_approval(&transaction, &approval_id)?;
    let run_id = pending_approval
        .run_id
        .as_deref()
        .ok_or_else(|| BuddyError::Validation("approval is not bound to a run".to_owned()))?;
    let message_id = read_payload_string(&pending_approval.payload, "messageId")?;
    let run = runs::find_run(&transaction, run_id)?;
    let message = messages::find_message(&transaction, &message_id)?;
    let approval = approvals::resolve_approval(&transaction, &approval_id, "approved")?;
    let event = run_events::append_run_event(
        &transaction,
        CreateBuddyRunEventRequest {
            event_type: "approval.resolved".to_owned(),
            payload: serde_json::json!({
                "approvalId": approval.id,
                "kind": approval.kind,
                "status": approval.status,
            }),
            run_id: run.id.clone(),
        },
    )?;
    transaction.commit()?;

    Ok(BuddyReadOnlyTaskApprovalPlan {
        approval,
        event,
        message,
        run,
    })
}

pub fn deny_read_only_task_approval(
    connection: &mut Connection,
    approval_id: String,
) -> BuddyResult<BuddyReadOnlyTaskDenial> {
    let transaction = connection.transaction()?;
    let pending_approval = find_pending_read_only_task_approval(&transaction, &approval_id)?;
    let run_id = pending_approval
        .run_id
        .as_deref()
        .ok_or_else(|| BuddyError::Validation("approval is not bound to a run".to_owned()))?;
    let approval = approvals::resolve_approval(&transaction, &approval_id, "denied")?;
    let run = runs::update_run_status(&transaction, run_id.to_owned(), "cancelled".to_owned())?;
    let approval_event = run_events::append_run_event(
        &transaction,
        CreateBuddyRunEventRequest {
            event_type: "approval.resolved".to_owned(),
            payload: serde_json::json!({
                "approvalId": approval.id,
                "kind": approval.kind,
                "status": approval.status,
            }),
            run_id: run.id.clone(),
        },
    )?;
    let cancelled_event = run_events::append_run_event(
        &transaction,
        CreateBuddyRunEventRequest {
            event_type: "run.cancelled".to_owned(),
            payload: serde_json::json!({
                "approvalId": approval.id,
                "reason": "denied",
            }),
            run_id: run.id.clone(),
        },
    )?;
    transaction.commit()?;

    Ok(BuddyReadOnlyTaskDenial {
        approval,
        events: vec![approval_event, cancelled_event],
        run,
    })
}

fn find_pending_read_only_task_approval(
    connection: &Connection,
    approval_id: &str,
) -> BuddyResult<BuddyApproval> {
    let approval = approvals::find_approval(connection, approval_id)?;
    if approval.status != "pending" {
        return Err(BuddyError::Validation("approval is not pending".to_owned()));
    }

    if approval.kind != READ_ONLY_TASK_APPROVAL_KIND {
        return Err(BuddyError::Validation(
            "approval is not a read-only task".to_owned(),
        ));
    }

    Ok(approval)
}

fn read_payload_string(payload: &serde_json::Value, field: &str) -> BuddyResult<String> {
    payload
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| BuddyError::Validation(format!("approval payload missing {field}")))
}
