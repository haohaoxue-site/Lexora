use serde_json::{Map, Value};

use super::{
    compact::{compact_json_value, insert_compact_value},
    CHAT_EVENT_ARRAY_LIMIT, CHAT_EVENT_FIELD_MAX_CHARS, CHAT_EVENT_SHORT_TEXT_MAX_CHARS,
};

pub(super) fn project_plan_updated_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "explanation",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
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

    if let Some(plan) = payload.get("plan").and_then(Value::as_array) {
        projected.insert(
            "plan".to_owned(),
            Value::Array(
                plan.iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_plan_step)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_plan_step(value: &Value) -> Value {
    let Some(step) = value.as_object() else {
        return compact_json_value(value, CHAT_EVENT_SHORT_TEXT_MAX_CHARS, 1);
    };

    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        step,
        "status",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(&mut projected, step, "step", CHAT_EVENT_FIELD_MAX_CHARS, 1);

    Value::Object(projected)
}
