use std::collections::BTreeSet;

pub(super) fn summarize_unified_diff_file_paths(diff: &str) -> Vec<String> {
    let mut file_paths = BTreeSet::new();
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = rest
                .split_whitespace()
                .nth(1)
                .and_then(normalize_codex_project_file_path)
            {
                file_paths.insert(path);
            }
            continue;
        }

        if let Some(path) = line
            .strip_prefix("+++ ")
            .or_else(|| line.strip_prefix("--- "))
            .and_then(normalize_codex_project_file_path)
        {
            file_paths.insert(path);
        }
    }

    file_paths.into_iter().collect()
}

pub(super) fn summarize_patch_change_file_paths(changes: &serde_json::Value) -> Vec<String> {
    let mut file_paths = BTreeSet::new();
    collect_patch_change_file_paths(changes, &mut file_paths);

    file_paths.into_iter().collect()
}

fn collect_patch_change_file_paths(value: &serde_json::Value, file_paths: &mut BTreeSet<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_patch_change_file_paths(item, file_paths);
            }
        }
        serde_json::Value::Object(object) => {
            for key in ["path", "filePath", "file_path", "targetFile", "target_file"] {
                if let Some(path) = object
                    .get(key)
                    .and_then(serde_json::Value::as_str)
                    .and_then(normalize_codex_project_file_path)
                {
                    file_paths.insert(path);
                }
            }
            for value in object.values() {
                collect_patch_change_file_paths(value, file_paths);
            }
        }
        _ => {}
    }
}

pub(super) fn count_patch_changes(changes: &serde_json::Value) -> usize {
    match changes {
        serde_json::Value::Array(items) => items.len(),
        serde_json::Value::Object(object) => object.len(),
        serde_json::Value::Null => 0,
        _ => 1,
    }
}

fn normalize_codex_project_file_path(path: &str) -> Option<String> {
    let path = path.trim().trim_matches('"');
    if path.is_empty() || path == "/dev/null" {
        return None;
    }

    Some(
        path.strip_prefix("a/")
            .or_else(|| path.strip_prefix("b/"))
            .unwrap_or(path)
            .to_owned(),
    )
}

pub(super) fn with_method_and_protocol_fields(
    method: String,
    params: serde_json::Value,
    item_id: Option<String>,
    thread_id: String,
    turn_id: String,
) -> serde_json::Value {
    let mut payload = with_protocol_fields(params, item_id, thread_id, turn_id);
    if let Some(payload) = payload.as_object_mut() {
        payload.insert("method".to_owned(), serde_json::Value::String(method));
    }

    payload
}

pub(super) fn with_protocol_fields(
    params: serde_json::Value,
    item_id: Option<String>,
    thread_id: String,
    turn_id: String,
) -> serde_json::Value {
    let mut payload = match params {
        serde_json::Value::Object(object) => serde_json::Value::Object(object),
        value => serde_json::json!({ "params": value }),
    };

    if let Some(payload) = payload.as_object_mut() {
        if let Some(item_id) = item_id {
            payload
                .entry("itemId")
                .or_insert(serde_json::Value::String(item_id));
        }
        payload.insert(
            "protocol".to_owned(),
            serde_json::Value::String("codex_app_server".to_owned()),
        );
        payload
            .entry("threadId")
            .or_insert(serde_json::Value::String(thread_id));
        payload
            .entry("turnId")
            .or_insert(serde_json::Value::String(turn_id));
    }

    payload
}
