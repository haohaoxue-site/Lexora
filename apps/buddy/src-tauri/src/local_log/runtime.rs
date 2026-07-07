use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use serde::Deserialize;
use serde_json::Value;

use crate::{
    app_paths::{CONVERSATIONS_DIR_NAME, RUNS_DIR_NAME},
    error::{BuddyError, BuddyResult},
    local_log::{
        append_jsonl_event, conversation_index_path, conversation_log_path, run_index_path,
        run_log_path, LocalLogEvent, LocalLogTimestamp,
    },
};

const CONVERSATION_INDEX_EVENT_TYPE: &str = "conversation.indexed";
const RUN_INDEX_EVENT_TYPE: &str = "run.indexed";

#[derive(Clone)]
pub struct LocalLogRuntime {
    buddy_home: PathBuf,
    event_ids: LocalLogEventIdSource,
    timestamps: LocalLogTimestampSource,
}

#[derive(Clone)]
#[cfg_attr(not(test), allow(dead_code))]
enum LocalLogEventIdSource {
    Uuid,
    Counter {
        next: Arc<AtomicU64>,
        prefix: String,
    },
}

#[derive(Clone)]
#[cfg_attr(not(test), allow(dead_code))]
enum LocalLogTimestampSource {
    System,
    Fixed(LocalLogTimestamp),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalLogIndexLine {
    schema_version: u16,
    #[serde(rename = "type")]
    event_type: String,
    payload: LocalLogIndexPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalLogIndexPayload {
    log_path: String,
}

impl LocalLogRuntime {
    pub fn new(buddy_home: PathBuf) -> Self {
        Self {
            buddy_home,
            event_ids: LocalLogEventIdSource::Uuid,
            timestamps: LocalLogTimestampSource::System,
        }
    }

    #[cfg(test)]
    pub fn fixed_for_test(buddy_home: PathBuf, timestamp: LocalLogTimestamp) -> Self {
        Self {
            buddy_home,
            event_ids: LocalLogEventIdSource::Counter {
                next: Arc::new(AtomicU64::new(1)),
                prefix: "test-event".to_owned(),
            },
            timestamps: LocalLogTimestampSource::Fixed(timestamp),
        }
    }

    pub fn conversation_log_path(&self, conversation_id: &str) -> PathBuf {
        conversation_log_path(&self.buddy_home, self.timestamp(), conversation_id)
    }

    pub fn run_log_path(&self, run_id: &str) -> PathBuf {
        run_log_path(&self.buddy_home, self.timestamp(), run_id)
    }

    pub fn relative_path(&self, path: &Path) -> BuddyResult<String> {
        let relative_path = path.strip_prefix(&self.buddy_home).map_err(|_| {
            BuddyError::Validation("local log path must stay under Buddy home".to_owned())
        })?;

        Ok(relative_path.to_string_lossy().into_owned())
    }

    pub fn absolute_path(&self, relative_path: &str) -> PathBuf {
        self.buddy_home.join(relative_path)
    }

    pub fn checked_absolute_path(&self, relative_path: &str) -> BuddyResult<PathBuf> {
        let path = Path::new(relative_path);
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return Err(BuddyError::Validation(
                "local log path must be relative to Buddy home".to_owned(),
            ));
        }

        Ok(self.absolute_path(relative_path))
    }

    pub fn discover_conversation_logs(&self) -> BuddyResult<Vec<String>> {
        if let Some(indexed_logs) = self.discover_indexed_logs(
            conversation_index_path(&self.buddy_home),
            CONVERSATION_INDEX_EVENT_TYPE,
            validate_indexed_conversation_log_path,
        )? {
            if !indexed_logs.is_empty() {
                return Ok(indexed_logs);
            }
        }

        self.discover_jsonl_logs(CONVERSATIONS_DIR_NAME)
    }

    pub fn discover_run_logs(&self) -> BuddyResult<Vec<String>> {
        if let Some(indexed_logs) = self.discover_indexed_logs(
            run_index_path(&self.buddy_home),
            RUN_INDEX_EVENT_TYPE,
            validate_indexed_run_log_path,
        )? {
            if !indexed_logs.is_empty() {
                return Ok(indexed_logs);
            }
        }

        self.discover_jsonl_logs(RUNS_DIR_NAME)
    }

    pub fn append_event(
        &self,
        path: &Path,
        event_type: impl Into<String>,
        payload: Value,
    ) -> BuddyResult<LocalLogEvent> {
        let event = LocalLogEvent {
            event_id: self.next_event_id(),
            event_type: event_type.into(),
            payload,
            timestamp: self.timestamp().to_rfc3339_millis(),
        };
        append_jsonl_event(path, &event)?;

        Ok(event)
    }

    pub fn append_conversation_index_entry(
        &self,
        conversation_id: &str,
        log_path: &str,
    ) -> BuddyResult<LocalLogEvent> {
        let path = conversation_index_path(&self.buddy_home);

        self.append_event(
            &path,
            CONVERSATION_INDEX_EVENT_TYPE,
            serde_json::json!({
                "conversationId": conversation_id,
                "logPath": log_path,
            }),
        )
    }

    pub fn append_run_index_entry(
        &self,
        run_id: &str,
        log_path: &str,
    ) -> BuddyResult<LocalLogEvent> {
        let path = run_index_path(&self.buddy_home);

        self.append_event(
            &path,
            RUN_INDEX_EVENT_TYPE,
            serde_json::json!({
                "logPath": log_path,
                "runId": run_id,
            }),
        )
    }

    #[cfg(test)]
    pub fn absolute_path_for_test(&self, relative_path: &str) -> PathBuf {
        self.absolute_path(relative_path)
    }

    fn next_event_id(&self) -> String {
        match &self.event_ids {
            LocalLogEventIdSource::Uuid => uuid::Uuid::new_v4().to_string(),
            LocalLogEventIdSource::Counter { next, prefix } => {
                let id = next.fetch_add(1, Ordering::SeqCst);
                format!("{prefix}-{id}")
            }
        }
    }

    fn timestamp(&self) -> LocalLogTimestamp {
        match self.timestamps {
            LocalLogTimestampSource::System => LocalLogTimestamp::now_utc(),
            LocalLogTimestampSource::Fixed(timestamp) => timestamp,
        }
    }

    fn discover_jsonl_logs(&self, root_name: &str) -> BuddyResult<Vec<String>> {
        let root = self.buddy_home.join(root_name);
        if !root.is_dir() {
            return Ok(Vec::new());
        }

        let mut logs = Vec::new();
        collect_jsonl_logs(&self.buddy_home, &root, &mut logs)?;
        logs.sort();

        Ok(logs)
    }

    fn discover_indexed_logs(
        &self,
        index_path: PathBuf,
        event_type: &str,
        validate_log_path: fn(&str) -> BuddyResult<String>,
    ) -> BuddyResult<Option<Vec<String>>> {
        if !index_path.is_file() {
            return Ok(None);
        }

        let content = fs::read_to_string(index_path)?;
        let mut logs = Vec::new();
        for (index, line) in content.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let parsed: LocalLogIndexLine = serde_json::from_str(line).map_err(|error| {
                BuddyError::Validation(format!(
                    "local log index line {} is not valid JSON: {}",
                    index + 1,
                    error
                ))
            })?;
            if parsed.schema_version != 1 {
                return Err(BuddyError::Validation(format!(
                    "unsupported local log index schema version {}",
                    parsed.schema_version
                )));
            }
            if parsed.event_type != event_type {
                continue;
            }
            let log_path = validate_log_path(&parsed.payload.log_path)?;
            if !logs.contains(&log_path) {
                logs.push(log_path);
            }
        }
        logs.sort();

        Ok(Some(logs))
    }
}

fn validate_indexed_conversation_log_path(log_path: &str) -> BuddyResult<String> {
    validate_indexed_local_log_path(CONVERSATIONS_DIR_NAME, log_path)
}

fn validate_indexed_run_log_path(log_path: &str) -> BuddyResult<String> {
    validate_indexed_local_log_path(RUNS_DIR_NAME, log_path)
}

fn validate_indexed_local_log_path(root_name: &str, log_path: &str) -> BuddyResult<String> {
    let log_path = log_path.trim();
    if log_path.is_empty() {
        return Err(BuddyError::Validation(
            "local log index logPath is required".to_owned(),
        ));
    }
    let path = Path::new(log_path);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(BuddyError::Validation(
            "local log index logPath must stay under Buddy home".to_owned(),
        ));
    }
    if !log_path.starts_with(&format!("{root_name}/")) || !log_path.ends_with(".jsonl") {
        return Err(BuddyError::Validation(
            "local log index logPath must point to the expected JSONL root".to_owned(),
        ));
    }

    Ok(log_path.to_owned())
}

fn collect_jsonl_logs(
    buddy_home: &Path,
    directory: &Path,
    logs: &mut Vec<String>,
) -> BuddyResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_jsonl_logs(buddy_home, &path, logs)?;
            continue;
        }
        if !file_type.is_file()
            || path
                .extension()
                .and_then(|value| value.to_str())
                .is_none_or(|extension| extension != "jsonl")
        {
            continue;
        }
        let relative_path = path.strip_prefix(buddy_home).map_err(|_| {
            BuddyError::Validation("local log path must stay under Buddy home".to_owned())
        })?;
        logs.push(relative_path.to_string_lossy().into_owned());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::LocalLogRuntime;
    use crate::local_log::LocalLogTimestamp;

    #[test]
    fn checked_absolute_path_rejects_paths_outside_buddy_home() {
        let runtime = LocalLogRuntime::fixed_for_test(
            PathBuf::from("/tmp/lexora-buddy"),
            LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7),
        );

        assert!(runtime.checked_absolute_path("/tmp/run.jsonl").is_err());
        assert!(runtime
            .checked_absolute_path("../outside/run.jsonl")
            .is_err());
        assert_eq!(
            runtime
                .checked_absolute_path("runs/2026/07/06/run.jsonl")
                .expect("relative path should be accepted"),
            PathBuf::from("/tmp/lexora-buddy/runs/2026/07/06/run.jsonl")
        );
    }

    #[test]
    fn discovers_jsonl_logs_under_stable_buddy_subdirectories() {
        let buddy_home = std::env::temp_dir().join(format!(
            "lexora-buddy-discover-log-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(buddy_home.join("conversations/2026/07/06"))
            .expect("create conversation log dir");
        std::fs::create_dir_all(buddy_home.join("runs/2026/07/06")).expect("create run log dir");
        std::fs::write(
            buddy_home.join("conversations/2026/07/06/conversation-a.jsonl"),
            "",
        )
        .expect("write conversation log");
        std::fs::write(buddy_home.join("runs/2026/07/06/run-a.jsonl"), "").expect("write run log");
        std::fs::write(buddy_home.join("runs/2026/07/06/run-a.txt"), "")
            .expect("write ignored file");
        let runtime = LocalLogRuntime::fixed_for_test(
            buddy_home.clone(),
            LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7),
        );

        assert_eq!(
            runtime
                .discover_conversation_logs()
                .expect("discover conversation logs"),
            vec!["conversations/2026/07/06/conversation-a.jsonl"]
        );
        assert_eq!(
            runtime.discover_run_logs().expect("discover run logs"),
            vec!["runs/2026/07/06/run-a.jsonl"]
        );

        std::fs::remove_dir_all(buddy_home).expect("cleanup");
    }
}
