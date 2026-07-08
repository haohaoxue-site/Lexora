use serde_json::json;

use super::project_chat_run_event_payload;

#[test]
fn projects_router_decision_for_chat_events() {
    let projected = project_chat_run_event_payload(
        "router.decision",
        json!({
            "conversationId": "conv-1",
            "cwd": "/workspace",
            "debugBlob": "internal-only",
            "intent": "direct_answer",
            "memoryEligibility": {
                "decision": "enabled",
                "reason": "project scope"
            },
            "memoryPolicy": "eligible",
            "reason": "local answer is enough",
            "requiresRuntime": false,
            "userMessageId": "msg-1"
        }),
    );

    assert_eq!(projected["conversationId"], json!("conv-1"));
    assert_eq!(projected["intent"], json!("direct_answer"));
    assert_eq!(projected["memoryEligibility"]["decision"], json!("enabled"));
    assert_eq!(projected["requiresRuntime"], json!(false));
    assert!(projected.get("debugBlob").is_none());
}

#[test]
fn projects_external_refs_update_for_chat_events() {
    let projected = project_chat_run_event_payload(
        "run.external_refs.updated",
        json!({
            "runtime": "codex",
            "branchId": "branch-1",
            "conversationId": "conv-1",
            "cwd": "/workspace",
            "externalRunId": "turn-1",
            "externalThreadId": "thread-1",
            "protocol": "codex_app_server"
        }),
    );

    assert_eq!(projected["runtime"], json!("codex"));
    assert_eq!(projected["externalRunId"], json!("turn-1"));
    assert_eq!(projected["externalThreadId"], json!("thread-1"));
    assert_eq!(projected["protocol"], json!("codex_app_server"));
    assert!(projected.get("conversationId").is_none());
}

#[test]
fn projects_memory_reference_fields_for_chat_events() {
    let projected_context = project_chat_run_event_payload(
        "memory.context_pack",
        json!({
            "available": true,
            "entries": [
                {
                    "citationLabel": "M1",
                    "content": "raw memory content",
                    "lineEnd": 12,
                    "lineStart": 10,
                    "note": "matched project",
                    "path": "memory.md",
                    "scope": "project",
                    "sourceEventId": 123,
                    "sourceKind": "event",
                    "sourceRunId": "run-1"
                }
            ],
            "debugBlob": "internal-only"
        }),
    );

    assert_eq!(projected_context["entries"][0]["path"], json!("memory.md"));
    assert_eq!(projected_context["entries"][0]["lineStart"], json!(10));
    assert_eq!(projected_context["entries"][0]["lineEnd"], json!(12));
    assert_eq!(
        projected_context["entries"][0]["content"],
        json!("raw memory content")
    );
    assert!(projected_context.get("debugBlob").is_none());

    let projected_references = project_chat_run_event_payload(
        "assistant.references",
        json!({
            "citation": {
                "entries": [
                    {
                        "content": "not part of assistant reference projection",
                        "lineEnd": 12,
                        "lineStart": 10,
                        "note": "matched project",
                        "path": "memory.md"
                    }
                ]
            }
        }),
    );

    assert_eq!(
        projected_references["citation"]["entries"][0]["path"],
        json!("memory.md")
    );
    assert_eq!(
        projected_references["citation"]["entries"][0]["lineStart"],
        json!(10)
    );
    assert_eq!(
        projected_references["citation"]["entries"][0]["lineEnd"],
        json!(12)
    );
    assert_eq!(
        projected_references["citation"]["entries"][0]["note"],
        json!("matched project")
    );
}

#[test]
fn projects_host_action_for_chat_events_without_flattening_steps() {
    let projected = project_chat_run_event_payload(
        "host.action",
        json!({
            "version": 1,
            "action": "sequence",
            "source": "buddy_builtin_host_skill",
            "steps": [
                { "type": "move", "target": { "kind": "center" } },
                { "type": "animation", "animation": "celebrate", "durationMs": 3000 },
                { "type": "move", "target": { "kind": "home" }, "after": "sleep" }
            ],
            "debugBlob": "internal-only"
        }),
    );

    assert_eq!(projected["action"], json!("sequence"));
    assert_eq!(projected["version"], json!(1));
    assert_eq!(projected["steps"][0]["target"]["kind"], json!("center"));
    assert_eq!(projected["steps"][1]["animation"], json!("celebrate"));
    assert_eq!(projected["steps"][2]["target"]["kind"], json!("home"));
    assert_eq!(projected["steps"][2]["after"], json!("sleep"));
    assert!(projected.get("debugBlob").is_none());
}

#[test]
fn projects_tool_output_for_chat_events() {
    let output = format!("{}tail", "A".repeat(12_000));
    let projected = project_chat_run_event_payload(
        "tool.finished",
        json!({
            "item": {
                "aggregatedOutput": output,
                "command": "rg -n 你好 .",
                "debugBlob": "internal-only",
                "status": "completed",
                "type": "commandExecution"
            },
            "itemId": "tool-1"
        }),
    );

    let projected_output = projected["item"]["aggregatedOutput"]
        .as_str()
        .expect("projected output should be string");
    assert_eq!(projected["itemId"], json!("tool-1"));
    assert_eq!(projected["item"]["command"], json!("rg -n 你好 ."));
    assert!(projected_output.contains("12004 chars"));
    assert!(projected["item"].get("debugBlob").is_none());
}
