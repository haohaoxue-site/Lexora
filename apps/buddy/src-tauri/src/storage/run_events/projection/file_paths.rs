use serde_json::{Map, Value};

use super::CHAT_EVENT_FILE_PATH_LIMIT;

pub(super) fn insert_file_paths(projected: &mut Map<String, Value>, paths: Option<Vec<String>>) {
    let paths = paths.unwrap_or_default();
    if paths.is_empty() {
        return;
    }

    projected.insert(
        "filePaths".to_owned(),
        Value::Array(paths.into_iter().map(Value::String).collect()),
    );
}

pub(super) fn read_file_paths(payload: &Map<String, Value>) -> Option<Vec<String>> {
    let paths = payload
        .get("filePaths")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .fold(Vec::new(), push_unique_file_path)
        })
        .filter(|paths| !paths.is_empty())?;

    Some(paths)
}

pub(super) fn extract_unified_diff_file_paths(diff: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in diff.lines() {
        if let Some(path) = line.strip_prefix("+++ b/") {
            paths = push_unique_file_path(paths, path);
            continue;
        }

        if !line.starts_with("diff --git a/") {
            continue;
        }

        if let Some((_, path)) = line.rsplit_once(" b/") {
            paths = push_unique_file_path(paths, path);
        }
    }

    paths
}

pub(super) fn extract_patch_change_file_paths(value: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    let Some(changes) = value.as_array() else {
        return paths;
    };

    for change in changes {
        let Some(change) = change.as_object() else {
            continue;
        };
        for key in ["path", "file", "target"] {
            if let Some(path) = change.get(key).and_then(Value::as_str) {
                paths = push_unique_file_path(paths, path);
            }
        }
    }

    paths
}

fn push_unique_file_path(mut paths: Vec<String>, path: &str) -> Vec<String> {
    let path = path.trim();
    if path.is_empty() || paths.len() >= CHAT_EVENT_FILE_PATH_LIMIT {
        return paths;
    }

    if !paths.iter().any(|item| item == path) {
        paths.push(path.to_owned());
    }

    paths
}
