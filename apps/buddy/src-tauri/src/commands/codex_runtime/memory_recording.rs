use std::path::Path;

use crate::{
    domain::{BuddyRunEventType, BuddyRunStatus},
    intent::BuddyIntentDecision,
    memory,
    storage::{
        BuddyRun, BuddyStorage, CreateBuddyMemoryCandidateRequest, CreateBuddyRunEventRequest,
    },
};

pub(super) fn record_codex_chat_turn_memory(
    storage: &BuddyStorage,
    memory_root: &Path,
    run: &BuddyRun,
    content: &str,
    assistant_content: &str,
    source_project: Option<String>,
    intent_decision: &BuddyIntentDecision,
) {
    if !intent_decision.memory_eligibility.candidate_generation
        || !intent_decision.memory_eligibility.durable_write
    {
        return;
    }
    if run.status != BuddyRunStatus::Completed.as_str() {
        return;
    }
    let memory_safety = memory::classify_chat_turn_memory_safety(content, assistant_content);
    if memory_safety == memory::BuddyChatTurnMemorySafety::SkipErrorResponse {
        return;
    }

    let project_id = source_project
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let scope = if project_id.is_some() {
        "project-private"
    } else {
        "global"
    };
    let source_log_path = run
        .log_path
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("legacy-run:{}", run.id));
    let source_event_id = format!("run:{}:memory_candidate:continuity.chat_turn", run.id);
    let source_refs = serde_json::json!([
        {
            "projectId": project_id.as_deref(),
            "scope": scope,
            "sourceEventId": source_event_id,
            "sourceKind": "run_log",
            "sourceLogPath": source_log_path,
            "sourceRunId": run.id
        }
    ]);
    let is_sensitive_candidate =
        memory_safety == memory::BuddyChatTurnMemorySafety::DisabledSensitiveContent;
    let candidate_content = if is_sensitive_candidate {
        memory::create_disabled_sensitive_memory_content()
    } else {
        memory::create_chat_turn_memory_content(content, assistant_content)
    };
    let candidate_decision = if is_sensitive_candidate {
        "disabled"
    } else {
        "accepted"
    };
    let candidate_reason = if is_sensitive_candidate {
        "sensitive content detected; durable memory disabled"
    } else {
        "eligible completed codex turn"
    };
    let eligibility_reasons = if is_sensitive_candidate {
        serde_json::json!(["sensitive_content_detected"])
    } else {
        serde_json::json!(intent_decision.memory_eligibility.reasons)
    };
    let candidate_request = CreateBuddyMemoryCandidateRequest {
        candidate_type: "continuity.chat_turn".to_owned(),
        confidence: 0.82,
        content: candidate_content,
        conversation_id: run.conversation_id.clone(),
        decision: candidate_decision.to_owned(),
        eligibility: serde_json::json!({
            "candidateGeneration": !is_sensitive_candidate
                && intent_decision.memory_eligibility.candidate_generation,
            "durableWrite": !is_sensitive_candidate
                && intent_decision.memory_eligibility.durable_write,
            "policy": intent_decision.memory_policy.as_str(),
            "reasons": eligibility_reasons,
            "retrieval": intent_decision.memory_eligibility.retrieval
        }),
        project_id,
        reason: candidate_reason.to_owned(),
        run_id: Some(run.id.clone()),
        scope: scope.to_owned(),
        source_event_id: Some(source_event_id),
        source_log_path,
        source_refs,
    };
    let event_payload = match serde_json::to_value(&candidate_request) {
        Ok(payload) => payload,
        Err(error) => {
            eprintln!(
                "failed to serialize lexora buddy memory candidate event for run {}: {error}",
                run.id
            );
            return;
        }
    };
    let event_result = storage.append_run_event(CreateBuddyRunEventRequest::new(
        run.id.clone(),
        BuddyRunEventType::MemoryCandidateCreated,
        event_payload,
    ));
    if let Err(error) = event_result {
        eprintln!(
            "failed to record lexora buddy memory candidate event for run {}: {error}",
            run.id
        );
        return;
    }

    match storage.create_memory_candidate(candidate_request) {
        Ok(candidate) if !is_sensitive_candidate => {
            if let Err(error) =
                memory::candidates::accept_memory_candidate(storage, memory_root, &candidate.id)
            {
                eprintln!(
                    "failed to auto-apply lexora buddy memory candidate for run {}: {error}",
                    run.id
                );
            }
        }
        Ok(_) => {}
        Err(error) => {
            eprintln!(
                "failed to record lexora buddy memory candidate for run {}: {error}",
                run.id
            );
        }
    }
}
