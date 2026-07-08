use serde_json::{Map, Value};

use super::{compact::insert_compact_value, CHAT_EVENT_ARRAY_LIMIT, CHAT_EVENT_FIELD_MAX_CHARS};

pub(super) fn project_memory_context_pack_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    for key in [
        "available",
        "injected",
        "notModified",
        "packHashPrefix",
        "sourceCount",
    ] {
        insert_compact_value(&mut projected, payload, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    if let Some(entries) = payload.get("entries").and_then(Value::as_array) {
        projected.insert(
            "entries".to_owned(),
            Value::Array(
                entries
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_memory_context_entry)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_memory_context_entry(value: &Value) -> Value {
    let Some(entry) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in [
        "citationLabel",
        "content",
        "lineEnd",
        "lineStart",
        "note",
        "path",
        "scope",
        "sourceEventId",
        "sourceKind",
        "sourceRunId",
    ] {
        insert_compact_value(&mut projected, entry, key, CHAT_EVENT_FIELD_MAX_CHARS, 2);
    }

    Value::Object(projected)
}

pub(super) fn project_assistant_references_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    if let Some(citation) = payload.get("citation").and_then(Value::as_object) {
        let mut projected_citation = Map::new();
        if let Some(entries) = citation.get("entries").and_then(Value::as_array) {
            projected_citation.insert(
                "entries".to_owned(),
                Value::Array(
                    entries
                        .iter()
                        .take(CHAT_EVENT_ARRAY_LIMIT)
                        .map(project_assistant_reference_entry)
                        .collect(),
                ),
            );
        }
        projected.insert("citation".to_owned(), Value::Object(projected_citation));
    }

    Value::Object(projected)
}

fn project_assistant_reference_entry(value: &Value) -> Value {
    let Some(entry) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["lineEnd", "lineStart", "note", "path"] {
        insert_compact_value(&mut projected, entry, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    Value::Object(projected)
}
