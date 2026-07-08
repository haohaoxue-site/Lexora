use serde_json::{Map, Value};

use super::{
    compact::insert_compact_value,
    file_paths::{
        extract_patch_change_file_paths, extract_unified_diff_file_paths, insert_file_paths,
        read_file_paths,
    },
    CHAT_EVENT_FIELD_MAX_CHARS,
};

pub(super) fn project_diff_updated_payload(payload: &Map<String, Value>) -> Value {
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
    insert_file_paths(
        &mut projected,
        read_file_paths(payload).or_else(|| {
            payload
                .get("diff")
                .and_then(Value::as_str)
                .map(extract_unified_diff_file_paths)
        }),
    );

    Value::Object(projected)
}

pub(super) fn project_patch_updated_payload(payload: &Map<String, Value>) -> Value {
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
    insert_file_paths(
        &mut projected,
        read_file_paths(payload).or_else(|| {
            payload
                .get("changes")
                .map(extract_patch_change_file_paths)
                .filter(|paths| !paths.is_empty())
        }),
    );

    Value::Object(projected)
}
