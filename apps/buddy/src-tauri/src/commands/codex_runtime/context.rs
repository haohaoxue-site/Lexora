use std::path::Path;

use crate::{
    context_pack, domain::BuddyRuntime, error::BuddyError, intent::BuddyIntentDecision,
    storage::BuddyStorage,
};

use super::{super::chat_input::compose_buddy_runtime_instructions, BuddyCodexRunTarget};

pub(super) struct PreparedCodexRunContext {
    pub(super) runtime_instructions: String,
    pub(super) context_pack_diagnostic: context_pack::BuddyContextPackDiagnostic,
}

impl PreparedCodexRunContext {
    pub(super) fn runtime_instructions_content(&self) -> Option<&str> {
        (!self.runtime_instructions.trim().is_empty()).then_some(self.runtime_instructions.as_str())
    }
}

pub(super) struct PrepareCodexRunContextRequest<'a> {
    pub(super) storage: &'a BuddyStorage,
    pub(super) memory_root: &'a Path,
    pub(super) run_id: &'a str,
    pub(super) target: &'a BuddyCodexRunTarget,
    pub(super) runtime_cwd: &'a str,
    pub(super) source_project: Option<&'a str>,
    pub(super) intent_decision: &'a BuddyIntentDecision,
    pub(super) selected_context: &'a [context_pack::BuddyContextPackSelectedContextItem],
}

pub(super) fn prepare_codex_run_context(
    request: PrepareCodexRunContextRequest<'_>,
) -> Result<PreparedCodexRunContext, BuddyError> {
    let source_refs = if request.intent_decision.memory_eligibility.retrieval {
        request
            .storage
            .list_recent_memory_source_refs(request.source_project, 6)
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let context_pack =
        context_pack::build_context_pack(context_pack::BuddyContextPackBuildInput {
            runtime_cwd: request.runtime_cwd,
            intent_decision: request.intent_decision,
            max_chars: 2400,
            memory_root: request.memory_root,
            selected_context: request.selected_context,
            source_project: request.source_project,
            source_refs: &source_refs,
        })?;
    let runtime_instructions =
        compose_buddy_runtime_instructions(Some(context_pack.content.as_str()));
    let context_owner_id = request.target.context_owner_id()?;
    let context_pack_state_key = context_pack::context_pack_state_key(
        context_owner_id,
        BuddyRuntime::Codex.as_str(),
        request.runtime_cwd,
    );
    let previous_context_pack_hash = request
        .storage
        .read_setting_json(&context_pack_state_key)
        .ok()
        .flatten()
        .and_then(|setting| {
            setting
                .value
                .get("packHash")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        });
    let context_pack_diagnostic = context_pack::create_context_pack_diagnostic(
        &context_pack,
        previous_context_pack_hash.as_deref(),
    );
    let _ = request.storage.write_setting_json(
        &context_pack::context_pack_diagnostics_key(request.run_id),
        serde_json::json!({
            "injected": context_pack_diagnostic.injected,
            "notModified": context_pack_diagnostic.not_modified,
            "packHash": context_pack_diagnostic.pack_hash.as_deref(),
            "retrievedMemory": &context_pack_diagnostic.retrieved_memory,
            "sourceCount": context_pack_diagnostic.retrieved_memory.len(),
            "sourceMemoryIds": &context_pack_diagnostic.source_memory_ids,
        }),
    );
    let cwd_hash = context_pack_state_key
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_owned();
    let _ = request.storage.write_setting_json(
        &context_pack_state_key,
        serde_json::json!({
            "packHash": context_pack.hash,
            "sessionId": request.target.session_id.as_deref(),
            "conversationId": request.target.conversation_id.as_deref(),
            "runtime": BuddyRuntime::Codex.as_str(),
            "cwdHash": cwd_hash,
        }),
    );

    Ok(PreparedCodexRunContext {
        runtime_instructions,
        context_pack_diagnostic,
    })
}
