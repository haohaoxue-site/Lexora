use serde_json::{Map, Value};

mod codex;
mod compact;
mod diff;
mod file_paths;
mod host;
mod memory;
mod message;
mod plan;
#[cfg(test)]
mod tests;
mod tool;
mod user_input;

use codex::project_codex_notification_payload;
use compact::project_selected_payload;
use diff::{project_diff_updated_payload, project_patch_updated_payload};
use host::project_host_action_payload;
use memory::{project_assistant_references_payload, project_memory_context_pack_payload};
use message::{project_message_delta_payload, project_turn_completed_payload};
use plan::project_plan_updated_payload;
use tool::project_tool_event_payload;
use user_input::project_user_input_payload;

const CHAT_EVENT_TEXT_MAX_CHARS: usize = 12_000;
const CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS: usize = 4_000;
const CHAT_EVENT_FIELD_MAX_CHARS: usize = 1_200;
const CHAT_EVENT_SHORT_TEXT_MAX_CHARS: usize = 240;
const CHAT_EVENT_ARRAY_LIMIT: usize = 40;
const CHAT_EVENT_FILE_PATH_LIMIT: usize = 80;

pub(super) fn project_chat_run_event_payload(event_type: &str, payload: Value) -> Value {
    let Value::Object(payload) = payload else {
        return Value::Object(Map::new());
    };

    match event_type {
        "host.action" => project_host_action_payload(&payload),
        "animation.intent" => project_selected_payload(
            &payload,
            &[
                "durationMs",
                "expiresAtUnixMs",
                "intent",
                "priority",
                "reason",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "approval.requested" => project_selected_payload(
            &payload,
            &["command", "itemId", "method", "reason"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "assistant.references" => project_assistant_references_payload(&payload),
        "codex.notification" => project_codex_notification_payload(&payload),
        "memory.context_pack" => project_memory_context_pack_payload(&payload),
        "message.completed" => project_selected_payload(
            &payload,
            &["itemId", "messageId", "phase", "turnId"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "message.delta" => project_message_delta_payload(&payload),
        "plan.delta" => project_selected_payload(
            &payload,
            &["delta", "itemId", "turnId"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "plan.updated" => project_plan_updated_payload(&payload),
        "run.cancelled" | "run.completed" => {
            project_selected_payload(&payload, &["message", "status"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "run.failed" => {
            project_selected_payload(&payload, &["message"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "run.started" => project_selected_payload(
            &payload,
            &["runtime", "cwd", "model", "userMessageId"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "router.decision" => project_selected_payload(
            &payload,
            &[
                "conversationId",
                "cwd",
                "intent",
                "memoryEligibility",
                "memoryPolicy",
                "reason",
                "requiresRuntime",
                "userMessageId",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "run.external_refs.updated" => project_selected_payload(
            &payload,
            &[
                "runtime",
                "cwd",
                "externalRunId",
                "externalThreadId",
                "protocol",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "tool.finished" | "tool.started" => project_tool_event_payload(&payload),
        "tool.output_delta" => project_selected_payload(
            &payload,
            &["delta", "itemId"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "tool.patch_updated" => project_patch_updated_payload(&payload),
        "tool.progress" => {
            project_selected_payload(&payload, &["itemId", "message"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "tool.terminal_interaction" => project_selected_payload(
            &payload,
            &["itemId", "stdin"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "turn.completed" => project_turn_completed_payload(&payload),
        "turn.diff.updated" => project_diff_updated_payload(&payload),
        "user_input.requested" => project_user_input_payload(&payload),
        _ => Value::Object(Map::new()),
    }
}
