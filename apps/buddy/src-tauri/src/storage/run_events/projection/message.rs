use serde_json::{Map, Value};

use super::{compact::insert_compact_value, CHAT_EVENT_FIELD_MAX_CHARS, CHAT_EVENT_TEXT_MAX_CHARS};

pub(super) fn project_message_delta_payload(payload: &Map<String, Value>) -> Value {
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
        "phase",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "delta",
        CHAT_EVENT_TEXT_MAX_CHARS,
        1,
    );

    Value::Object(projected)
}

pub(super) fn project_turn_completed_payload(payload: &Map<String, Value>) -> Value {
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
        "turnId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(final_message) = payload.get("finalAgentMessage").and_then(Value::as_object) {
        let mut message = Map::new();
        insert_compact_value(
            &mut message,
            final_message,
            "id",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "itemId",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "phase",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "text",
            CHAT_EVENT_TEXT_MAX_CHARS,
            1,
        );
        projected.insert("finalAgentMessage".to_owned(), Value::Object(message));
    }

    Value::Object(projected)
}
