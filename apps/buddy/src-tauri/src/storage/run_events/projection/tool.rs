use serde_json::{Map, Value};

use super::{
    compact::insert_compact_value,
    file_paths::{extract_patch_change_file_paths, insert_file_paths, read_file_paths},
    CHAT_EVENT_ARRAY_LIMIT, CHAT_EVENT_FIELD_MAX_CHARS, CHAT_EVENT_SHORT_TEXT_MAX_CHARS,
    CHAT_EVENT_TEXT_MAX_CHARS,
};

pub(super) fn project_tool_event_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(item) = payload.get("item") {
        projected.insert("item".to_owned(), project_tool_item(item));
    }

    Value::Object(projected)
}

fn project_tool_item(value: &Value) -> Value {
    let Some(item) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["command", "name", "path", "query", "status", "tool", "type"] {
        insert_compact_value(&mut projected, item, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    for key in ["aggregatedOutput", "output"] {
        insert_compact_value(&mut projected, item, key, CHAT_EVENT_TEXT_MAX_CHARS, 1);
    }
    insert_file_paths(
        &mut projected,
        read_file_paths(item).or_else(|| {
            item.get("changes")
                .map(extract_patch_change_file_paths)
                .filter(|paths| !paths.is_empty())
        }),
    );

    if let Some(arguments) = item.get("arguments") {
        projected.insert("arguments".to_owned(), project_tool_arguments(arguments));
    }
    if let Some(actions) = item.get("commandActions").and_then(Value::as_array) {
        projected.insert(
            "commandActions".to_owned(),
            Value::Array(
                actions
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_command_action)
                    .collect(),
            ),
        );
    }
    if let Some(result) = item.get("result").and_then(project_tool_result) {
        projected.insert("result".to_owned(), result);
    }

    Value::Object(projected)
}

fn project_tool_arguments(value: &Value) -> Value {
    let Some(arguments) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["name", "path", "pattern", "q", "query", "uri"] {
        insert_compact_value(
            &mut projected,
            arguments,
            key,
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
    }

    Value::Object(projected)
}

fn project_command_action(value: &Value) -> Value {
    let Some(action) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["command", "name", "path", "query", "type"] {
        insert_compact_value(&mut projected, action, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    insert_file_paths(&mut projected, read_file_paths(action));

    Value::Object(projected)
}

fn project_tool_result(value: &Value) -> Option<Value> {
    let result = value.as_object()?;
    let content = result.get("content")?.as_array()?;
    let projected_content = content
        .iter()
        .take(3)
        .filter_map(project_tool_result_content)
        .collect::<Vec<_>>();

    if projected_content.is_empty() {
        return None;
    }

    let mut projected = Map::new();
    projected.insert("content".to_owned(), Value::Array(projected_content));

    Some(Value::Object(projected))
}

fn project_tool_result_content(value: &Value) -> Option<Value> {
    let content = value.as_object()?;
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        content,
        "type",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        content,
        "text",
        CHAT_EVENT_SHORT_TEXT_MAX_CHARS,
        1,
    );

    (!projected.is_empty()).then_some(Value::Object(projected))
}
