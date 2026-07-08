use serde_json::{Map, Value};

use super::CHAT_EVENT_ARRAY_LIMIT;

pub(super) fn project_selected_payload(
    payload: &Map<String, Value>,
    keys: &[&str],
    string_max_chars: usize,
) -> Value {
    let mut projected = Map::new();
    for key in keys {
        insert_compact_value(&mut projected, payload, key, string_max_chars, 2);
    }

    Value::Object(projected)
}

pub(super) fn insert_compact_value(
    projected: &mut Map<String, Value>,
    payload: &Map<String, Value>,
    key: &str,
    string_max_chars: usize,
    depth: usize,
) {
    if let Some(value) = payload.get(key) {
        projected.insert(
            key.to_owned(),
            compact_json_value(value, string_max_chars, depth),
        );
    }
}

pub(super) fn compact_json_value(value: &Value, string_max_chars: usize, depth: usize) -> Value {
    match value {
        Value::Array(items) => {
            if depth == 0 {
                return Value::Array(Vec::new());
            }

            Value::Array(
                items
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(|item| compact_json_value(item, string_max_chars, depth.saturating_sub(1)))
                    .collect(),
            )
        }
        Value::Bool(_) | Value::Null | Value::Number(_) => value.clone(),
        Value::Object(object) => {
            if depth == 0 {
                return Value::Object(Map::new());
            }

            Value::Object(
                object
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(|(key, value)| {
                        (
                            key.clone(),
                            compact_json_value(value, string_max_chars, depth.saturating_sub(1)),
                        )
                    })
                    .collect(),
            )
        }
        Value::String(text) => Value::String(compact_text(text, string_max_chars)),
    }
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let total_chars = value.chars().count();
    if total_chars <= max_chars {
        return value.to_owned();
    }

    let cutoff = value
        .char_indices()
        .nth(max_chars)
        .map(|(index, _)| index)
        .unwrap_or(value.len());

    format!("{}... ({} chars)", &value[..cutoff], total_chars)
}
