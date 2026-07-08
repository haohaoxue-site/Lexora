use std::path::PathBuf;

use crate::{
    agents::codex,
    context_pack,
    domain::BuddyRuntime,
    error::BuddyError,
    intent::BuddyIntentDecision,
    storage::{BuddyMessage, BuddyRun, BuddyRunEvent, BuddyStorage},
};

use super::{
    host_action::append_buddy_host_action_events,
    run_state::{BuddyRunCancellationToken, BuddyRunStateEventPublisher},
};

mod completion;
mod context;
mod memory_recording;
mod preparation;
mod runtime_execution;
mod terminal_state;

use completion::{create_codex_assistant_display_content, persist_completed_codex_run};
use memory_recording::record_codex_chat_turn_memory;
use preparation::{prepare_codex_runtime_run, PrepareCodexRuntimeRunRequest};
use runtime_execution::{run_codex_runtime, CodexRuntimeRunRequest};
pub(super) use terminal_state::record_codex_run_cancelled;
use terminal_state::{abort_if_buddy_run_cancelled, record_codex_run_failure};

pub(super) struct BuddyCodexReadOnlyExecution {
    pub(super) assistant_message: BuddyMessage,
    pub(super) events: Vec<BuddyRunEvent>,
    pub(super) run: BuddyRun,
}

#[derive(Clone, Debug)]
pub(super) struct BuddyCodexRunTarget {
    branch_id: Option<String>,
    conversation_id: Option<String>,
    session_id: Option<String>,
    triggering_message_id: Option<String>,
}

impl BuddyCodexRunTarget {
    pub(super) fn session(session_id: String) -> Self {
        Self {
            branch_id: None,
            conversation_id: None,
            session_id: Some(session_id),
            triggering_message_id: None,
        }
    }

    pub(super) fn conversation(
        conversation_id: String,
        branch_id: String,
        triggering_message_id: String,
    ) -> Self {
        Self {
            branch_id: Some(branch_id),
            conversation_id: Some(conversation_id),
            session_id: None,
            triggering_message_id: Some(triggering_message_id),
        }
    }

    fn context_owner_id(&self) -> Result<&str, BuddyError> {
        self.session_id
            .as_deref()
            .or(self.conversation_id.as_deref())
            .ok_or_else(|| BuddyError::Validation("codex run target is missing".to_owned()))
    }

    fn event_session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    fn upsert_codex_runtime_binding(
        &self,
        storage: &BuddyStorage,
        runtime_cwd: &str,
        external_thread_id: String,
    ) -> Result<(), BuddyError> {
        if let Some(session_id) = self.session_id.as_deref() {
            storage.upsert_runtime_binding(
                session_id.to_owned(),
                BuddyRuntime::Codex.as_str().to_owned(),
                Some(runtime_cwd.to_owned()),
                Some(external_thread_id),
                None,
            )?;

            return Ok(());
        }

        let conversation_id = self.conversation_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("codex conversation target is missing".to_owned())
        })?;
        let branch_id = self.branch_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("codex conversation branch target is missing".to_owned())
        })?;
        storage.upsert_conversation_runtime_binding(
            conversation_id.to_owned(),
            branch_id.to_owned(),
            BuddyRuntime::Codex.as_str().to_owned(),
            Some(runtime_cwd.to_owned()),
            Some(external_thread_id),
            None,
        )?;

        Ok(())
    }
}

pub(super) struct ExistingCodexReadOnlyRunRequest {
    pub(super) approval_id: Option<String>,
    pub(super) attachment_count: usize,
    pub(super) runtime_cwd: String,
    pub(super) content: String,
    pub(super) input: Vec<codex::CodexUserInput>,
    pub(super) intent_decision: BuddyIntentDecision,
    pub(super) memory_root: PathBuf,
    pub(super) model_selection: Option<codex::CodexModelSelection>,
    pub(super) run: BuddyRun,
    pub(super) selected_context: Vec<context_pack::BuddyContextPackSelectedContextItem>,
    pub(super) target: BuddyCodexRunTarget,
    pub(super) source_project: Option<String>,
    pub(super) storage: BuddyStorage,
    pub(super) cancellation: Option<BuddyRunCancellationToken>,
    pub(super) event_publisher: BuddyRunStateEventPublisher,
    pub(super) user_message_id: String,
}

pub(super) fn execute_existing_codex_read_only_run(
    request: ExistingCodexReadOnlyRunRequest,
) -> Result<BuddyCodexReadOnlyExecution, BuddyError> {
    let ExistingCodexReadOnlyRunRequest {
        approval_id,
        attachment_count,
        runtime_cwd,
        content,
        input,
        intent_decision,
        memory_root,
        model_selection,
        mut run,
        selected_context,
        target,
        source_project,
        storage,
        cancellation,
        event_publisher,
        user_message_id,
    } = request;
    let approval_id = approval_id.as_deref();

    let prepared_run = prepare_codex_runtime_run(PrepareCodexRuntimeRunRequest {
        storage: &storage,
        approval_id,
        attachment_count,
        runtime_cwd: &runtime_cwd,
        run,
        memory_root: &memory_root,
        target: &target,
        source_project: source_project.as_deref(),
        intent_decision: &intent_decision,
        selected_context: &selected_context,
        model_selection: model_selection.as_ref(),
        cancellation: cancellation.as_ref(),
        event_publisher: &event_publisher,
        user_message_id: &user_message_id,
    })?;
    run = prepared_run.run;
    let mut events = prepared_run.events;
    let runtime_result = run_codex_runtime(CodexRuntimeRunRequest {
        approval_id,
        runtime_cwd: &runtime_cwd,
        runtime_instructions_content: prepared_run.context.runtime_instructions_content(),
        cancellation: cancellation.clone(),
        content: &content,
        input: &input,
        model_selection: model_selection.as_ref(),
        existing_thread_id: run.external_thread_id.as_deref(),
        protocol: prepared_run.protocol,
        run_id: &run.id,
        target: &target,
        storage: &storage,
        event_publisher: &event_publisher,
        user_message_id: &user_message_id,
    })?;
    if let Some(updated_run) = runtime_result.run {
        run = updated_run;
        event_publisher.emit_run(&run);
    }
    events.extend(runtime_result.projected_events);

    let runtime_output = runtime_result.output;
    append_buddy_host_action_events(
        &storage,
        &run.id,
        &mut events,
        target.event_session_id(),
        &event_publisher,
        &runtime_output,
    )?;
    let assistant_content = create_codex_assistant_display_content(&runtime_output.final_message);
    abort_if_buddy_run_cancelled(
        &storage,
        &run.id,
        approval_id,
        runtime_output.protocol,
        cancellation.as_ref(),
        &event_publisher,
    )?;
    let event_count_before_finalize = events.len();
    let finalize_result = persist_completed_codex_run(
        &storage,
        &mut run,
        &mut events,
        &target,
        approval_id,
        &runtime_output,
        &assistant_content,
    );
    let assistant_message = match finalize_result {
        Ok(assistant_message) => assistant_message,
        Err(error) => {
            let error_message = error.to_string();
            match record_codex_run_failure(
                &storage,
                &run.id,
                approval_id,
                runtime_output.protocol,
                format!("failed to persist completed codex run: {error_message}"),
            ) {
                Ok(finished_run) => event_publisher.emit_finished_run(&finished_run),
                Err(record_error) => {
                    return Err(BuddyError::Runtime(format!(
                        "{error_message}; failed to record run failure: {record_error}"
                    )));
                }
            }

            return Err(error);
        }
    };
    event_publisher.emit_events(
        &events[event_count_before_finalize..],
        target.event_session_id(),
    );
    event_publisher.emit_run(&run);
    record_codex_chat_turn_memory(
        &storage,
        &memory_root,
        &run,
        &content,
        &assistant_content,
        source_project,
        &intent_decision,
    );

    Ok(BuddyCodexReadOnlyExecution {
        assistant_message,
        events,
        run,
    })
}

#[cfg(test)]
mod tests;
