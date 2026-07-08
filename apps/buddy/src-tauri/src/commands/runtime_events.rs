use crate::context_pack;

pub(super) struct CodexRuntimeOutput {
    pub(super) final_memory_citation: Option<serde_json::Value>,
    pub(super) final_message: String,
    pub(super) protocol: &'static str,
    pub(super) stdout_bytes: Option<usize>,
    pub(super) thread_id: Option<String>,
    pub(super) turn_id: Option<String>,
}

pub(super) fn create_runtime_error_memory_eligibility_payload() -> serde_json::Value {
    serde_json::json!({
        "candidateGeneration": false,
        "durableWrite": false,
        "reasons": ["runtime_error"],
        "retrieval": false,
    })
}

pub(super) fn create_memory_context_pack_event_payload(
    diagnostic: &context_pack::BuddyContextPackDiagnostic,
) -> serde_json::Value {
    serde_json::json!({
        "available": diagnostic.injected || diagnostic.pack_hash.is_some() || !diagnostic.retrieved_memory.is_empty(),
        "conversationPath": &diagnostic.conversation_path,
        "intent": &diagnostic.intent,
        "injected": diagnostic.injected,
        "memoryEligibility": &diagnostic.memory_eligibility,
        "notModified": diagnostic.not_modified,
        "packHashPrefix": diagnostic.pack_hash.as_deref().map(hash_prefix),
        "persona": &diagnostic.persona,
        "projectScope": &diagnostic.project_scope,
        "entries": &diagnostic.retrieved_memory,
        "retrievedMemory": &diagnostic.retrieved_memory,
        "runtimeInstruction": &diagnostic.runtime_instruction,
        "selectedContext": &diagnostic.selected_context,
        "source": "buddy_context_pack",
        "sourceCount": diagnostic.retrieved_memory.len(),
        "sourceMemoryIds": &diagnostic.source_memory_ids,
    })
}

pub(super) fn create_assistant_references_event_payload(
    message_id: &str,
    thread_id: Option<&str>,
    turn_id: Option<&str>,
    citation: serde_json::Value,
) -> serde_json::Value {
    serde_json::json!({
        "citation": citation,
        "messageId": message_id,
        "source": "codex_native_memory",
        "threadId": thread_id,
        "turnId": turn_id,
    })
}

pub(super) fn has_memory_citation_entries(citation: &serde_json::Value) -> bool {
    citation
        .get("entries")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|entries| !entries.is_empty())
}

fn hash_prefix(value: &str) -> String {
    value.chars().take(8).collect()
}

#[cfg(test)]
mod tests {
    use super::create_memory_context_pack_event_payload;
    use crate::context_pack::{
        BuddyContextPackConversationPath, BuddyContextPackDiagnostic, BuddyContextPackIntent,
        BuddyContextPackMemoryEligibility, BuddyContextPackPersona, BuddyContextPackProjectScope,
        BuddyContextPackRetrievedMemory, BuddyContextPackRuntimeInstruction,
        BuddyContextPackSelectedContext,
    };

    #[test]
    fn creates_memory_context_pack_event_payload_with_memory_file_refs() {
        let diagnostic = BuddyContextPackDiagnostic {
            injected: true,
            not_modified: false,
            pack_hash: Some("1234567890abcdef".to_owned()),
            source_memory_ids: Vec::new(),
            persona: BuddyContextPackPersona {
                name: "Lexora Buddy".to_owned(),
                response_language: "zh-CN".to_owned(),
                role: "local agent".to_owned(),
            },
            intent: BuddyContextPackIntent {
                runtime: Some("codex".to_owned()),
                memory_policy: "standard".to_owned(),
                name: "agent_task".to_owned(),
                reason: "default agent task".to_owned(),
            },
            project_scope: BuddyContextPackProjectScope {
                cwd: "/tmp/lexora".to_owned(),
                source_project: Some("/tmp/lexora".to_owned()),
            },
            conversation_path: BuddyContextPackConversationPath {
                note: "current turn supplied separately".to_owned(),
            },
            selected_context: BuddyContextPackSelectedContext { items: Vec::new() },
            memory_eligibility: BuddyContextPackMemoryEligibility {
                candidate_generation: true,
                durable_write: true,
                reasons: vec!["agent_task".to_owned()],
                retrieval: true,
            },
            retrieved_memory: vec![BuddyContextPackRetrievedMemory {
                citation_label: "global/raw_memories.md:12-18".to_owned(),
                content: "用户：怎样处理 OpenRGB？\nLexora：先检查 OpenRGB server。".to_owned(),
                content_hash: "hash-1".to_owned(),
                line_end: 18,
                line_start: 12,
                note: "Accepted Buddy memory file reference.".to_owned(),
                path: "global/raw_memories.md".to_owned(),
                project_id: None,
                scope: "global".to_owned(),
                source_event_id: Some("event-1".to_owned()),
                source_kind: "buddy_memory_file".to_owned(),
                source_run_id: Some("run-1".to_owned()),
            }],
            runtime_instruction: BuddyContextPackRuntimeInstruction {
                items: vec!["current user request wins".to_owned()],
            },
        };

        let payload = create_memory_context_pack_event_payload(&diagnostic);

        assert_eq!(payload["source"], "buddy_context_pack");
        assert_eq!(payload["available"], true);
        assert_eq!(payload["injected"], true);
        assert_eq!(payload["notModified"], false);
        assert_eq!(payload["packHashPrefix"], "12345678");
        assert_eq!(payload["sourceCount"], 1);
        assert_eq!(payload["sourceMemoryIds"].as_array().unwrap().len(), 0);
        assert_eq!(payload["entries"][0]["sourceKind"], "buddy_memory_file");
        assert_eq!(payload["entries"][0]["path"], "global/raw_memories.md");
        assert_eq!(payload["entries"][0]["lineStart"], 12);
        assert_eq!(payload["retrievedMemory"][0]["sourceRunId"], "run-1");
        assert_eq!(payload["intent"]["name"], "agent_task");
    }
}
