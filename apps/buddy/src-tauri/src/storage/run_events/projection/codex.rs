use serde_json::{Map, Value};

use super::{
    compact::{compact_json_value, insert_compact_value, project_selected_payload},
    CHAT_EVENT_FIELD_MAX_CHARS,
};

pub(super) fn project_codex_notification_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "method",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    let method = payload.get("method").and_then(Value::as_str);
    if let Some(params) = payload.get("params") {
        projected.insert(
            "params".to_owned(),
            project_codex_notification_params(method, params),
        );
    }

    Value::Object(projected)
}

fn project_codex_notification_params(method: Option<&str>, value: &Value) -> Value {
    let Some(params) = value.as_object() else {
        return Value::Object(Map::new());
    };

    match method {
        Some("account/rateLimits/updated") => {
            let mut projected = Map::new();
            if let Some(rate_limits) = params.get("rateLimits").and_then(Value::as_object) {
                let mut projected_rate_limits = Map::new();
                insert_compact_value(
                    &mut projected_rate_limits,
                    rate_limits,
                    "rateLimitReachedType",
                    CHAT_EVENT_FIELD_MAX_CHARS,
                    1,
                );
                if let Some(credits) = rate_limits.get("credits").and_then(Value::as_object) {
                    let mut projected_credits = Map::new();
                    insert_compact_value(&mut projected_credits, credits, "hasCredits", 32, 1);
                    insert_compact_value(&mut projected_credits, credits, "unlimited", 32, 1);
                    projected_rate_limits
                        .insert("credits".to_owned(), Value::Object(projected_credits));
                }
                projected.insert(
                    "rateLimits".to_owned(),
                    Value::Object(projected_rate_limits),
                );
            }
            Value::Object(projected)
        }
        Some("mcpServer/startupStatus/updated") => project_selected_payload(
            params,
            &["error", "name", "status"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        Some("thread/status/changed") => {
            let mut projected = Map::new();
            insert_compact_value(
                &mut projected,
                params,
                "threadId",
                CHAT_EVENT_FIELD_MAX_CHARS,
                1,
            );
            if let Some(status) = params.get("status").and_then(Value::as_object) {
                projected.insert(
                    "status".to_owned(),
                    project_selected_payload(
                        status,
                        &["message", "type"],
                        CHAT_EVENT_FIELD_MAX_CHARS,
                    ),
                );
            }
            Value::Object(projected)
        }
        _ => compact_json_value(value, CHAT_EVENT_FIELD_MAX_CHARS, 2),
    }
}
