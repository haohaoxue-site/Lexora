use serde_json::{Map, Value};

use super::{compact::insert_compact_value, CHAT_EVENT_FIELD_MAX_CHARS};

pub(super) fn project_host_action_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    for key in [
        "action",
        "after",
        "animation",
        "durationMs",
        "priority",
        "reason",
        "source",
        "version",
    ] {
        insert_compact_value(&mut projected, payload, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    insert_compact_value(
        &mut projected,
        payload,
        "target",
        CHAT_EVENT_FIELD_MAX_CHARS,
        2,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "steps",
        CHAT_EVENT_FIELD_MAX_CHARS,
        4,
    );

    Value::Object(projected)
}
