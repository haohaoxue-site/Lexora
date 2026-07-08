use crate::{
    domain::{
        BuddyMessageRole, BuddyMessageVersionStatus, BuddyRunEventType, BuddyRunTerminalStatus,
    },
    error::BuddyError,
    storage::{
        AppendBuddyConversationMessageRequest, BuddyMessage, BuddyRun, BuddyRunEvent, BuddyStorage,
        CreateBuddyMessageRequest, CreateBuddyRunEventRequest,
    },
};

use super::{
    super::{
        host_action::strip_buddy_host_action_blocks,
        runtime_events::{
            create_assistant_references_event_payload, has_memory_citation_entries,
            CodexRuntimeOutput,
        },
    },
    BuddyCodexRunTarget,
};

pub(super) fn create_codex_assistant_display_content(final_message: &str) -> String {
    let display_content = strip_buddy_host_action_blocks(final_message);
    if display_content.is_empty() {
        "Codex 已完成，但没有返回可展示文本。".to_owned()
    } else {
        display_content
    }
}

pub(super) fn persist_completed_codex_run(
    storage: &BuddyStorage,
    run: &mut BuddyRun,
    events: &mut Vec<BuddyRunEvent>,
    target: &BuddyCodexRunTarget,
    approval_id: Option<&str>,
    runtime_output: &CodexRuntimeOutput,
    assistant_content: &str,
) -> Result<BuddyMessage, BuddyError> {
    let assistant_message = if let Some(session_id) = target.session_id.as_deref() {
        storage.create_message(CreateBuddyMessageRequest {
            attachments: Vec::new(),
            content: assistant_content.to_owned(),
            role: BuddyMessageRole::Assistant.as_str().to_owned(),
            session_id: session_id.to_owned(),
        })?
    } else {
        let conversation_id = target.conversation_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("assistant message conversation target is missing".to_owned())
        })?;
        let branch_id = target.branch_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("assistant message branch target is missing".to_owned())
        })?;
        storage.append_conversation_message(AppendBuddyConversationMessageRequest {
            attachments: Vec::new(),
            branch_id: branch_id.to_owned(),
            content: assistant_content.to_owned(),
            conversation_id: conversation_id.to_owned(),
            parent_message_id: target.triggering_message_id.clone(),
            role: BuddyMessageRole::Assistant.as_str().to_owned(),
            run_id: Some(run.id.clone()),
            version_group_id: None,
            version_index: 1,
            version_status: BuddyMessageVersionStatus::Active.as_str().to_owned(),
        })?
    };

    events.push(storage.append_run_event(CreateBuddyRunEventRequest::new(
        run.id.clone(),
        BuddyRunEventType::MessageCompleted,
        serde_json::json!({
            "approvalId": approval_id,
            "messageId": assistant_message.id,
            "protocol": runtime_output.protocol,
            "threadId": runtime_output.thread_id.as_deref(),
            "turnId": runtime_output.turn_id.as_deref(),
        }),
    ))?);
    if let Some(citation) = runtime_output
        .final_memory_citation
        .clone()
        .filter(has_memory_citation_entries)
    {
        events.push(storage.append_run_event(CreateBuddyRunEventRequest::new(
            run.id.clone(),
            BuddyRunEventType::AssistantReferences,
            create_assistant_references_event_payload(
                &assistant_message.id,
                runtime_output.thread_id.as_deref(),
                runtime_output.turn_id.as_deref(),
                citation,
            ),
        ))?);
    }
    let completed_run = storage.finish_run(
        run.id.clone(),
        BuddyRunTerminalStatus::Completed,
        serde_json::json!({
            "approvalId": approval_id,
            "protocol": runtime_output.protocol,
            "stdoutBytes": runtime_output.stdout_bytes,
            "threadId": runtime_output.thread_id.as_deref(),
            "turnId": runtime_output.turn_id.as_deref(),
        }),
    )?;
    *run = completed_run.run;
    events.push(completed_run.event);

    Ok(assistant_message)
}
