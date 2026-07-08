use serde_json::{Map, Value};

use super::{compact::insert_compact_value, CHAT_EVENT_ARRAY_LIMIT, CHAT_EVENT_FIELD_MAX_CHARS};

pub(super) fn project_user_input_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(questions) = payload.get("questions").and_then(Value::as_array) {
        projected.insert(
            "questions".to_owned(),
            Value::Array(
                questions
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_user_input_question)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_user_input_question(value: &Value) -> Value {
    let Some(question) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["header", "id", "question"] {
        insert_compact_value(&mut projected, question, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    Value::Object(projected)
}
