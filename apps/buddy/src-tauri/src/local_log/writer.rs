use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use crate::error::BuddyResult;

const LOCAL_LOG_SCHEMA_VERSION: u16 = 1;

#[derive(Clone, Debug)]
pub struct LocalLogEvent {
    pub event_id: String,
    pub payload: serde_json::Value,
    pub timestamp: String,
    pub event_type: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalLogEventLine<'a> {
    event_id: &'a str,
    schema_version: u16,
    timestamp: &'a str,
    #[serde(rename = "type")]
    event_type: &'a str,
    payload: &'a serde_json::Value,
}

pub fn append_jsonl_event(path: &Path, event: &LocalLogEvent) -> BuddyResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let line = LocalLogEventLine {
        event_id: &event.event_id,
        schema_version: LOCAL_LOG_SCHEMA_VERSION,
        timestamp: &event.timestamp,
        event_type: &event.event_type,
        payload: &event.payload,
    };
    let mut serialized = serde_json::to_vec(&line)?;
    serialized.push(b'\n');

    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(&serialized)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::{append_jsonl_event, LocalLogEvent};

    #[test]
    fn appends_jsonl_lines_with_event_id_timestamp_type_and_schema_version() {
        let dir = std::env::temp_dir().join(format!(
            "lexora-buddy-local-log-test-{}",
            uuid::Uuid::new_v4()
        ));
        let path = dir.join("runs/2026/07/06/run-1.jsonl");
        let event = LocalLogEvent {
            event_id: "event-1".to_owned(),
            payload: json!({ "runId": "run-1" }),
            timestamp: "2026-07-06T09:08:07.000Z".to_owned(),
            event_type: "run_meta".to_owned(),
        };

        append_jsonl_event(&path, &event).expect("append event");

        let content = fs::read_to_string(&path).expect("read jsonl");
        let lines = content.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 1);

        let value: serde_json::Value = serde_json::from_str(lines[0]).expect("json line");
        assert_eq!(value["eventId"], "event-1");
        assert_eq!(value["schemaVersion"], 1);
        assert_eq!(value["timestamp"], "2026-07-06T09:08:07.000Z");
        assert_eq!(value["type"], "run_meta");
        assert_eq!(value["payload"]["runId"], "run-1");

        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn appends_multiple_events_without_rewriting_existing_lines() {
        let dir = std::env::temp_dir().join(format!(
            "lexora-buddy-local-log-append-test-{}",
            uuid::Uuid::new_v4()
        ));
        let path = dir.join("conversation.jsonl");

        append_jsonl_event(
            &path,
            &LocalLogEvent {
                event_id: "event-1".to_owned(),
                payload: json!({ "index": 1 }),
                timestamp: "2026-07-06T09:08:07.000Z".to_owned(),
                event_type: "message.created".to_owned(),
            },
        )
        .expect("append first");
        append_jsonl_event(
            &path,
            &LocalLogEvent {
                event_id: "event-2".to_owned(),
                payload: json!({ "index": 2 }),
                timestamp: "2026-07-06T09:08:08.000Z".to_owned(),
                event_type: "message.created".to_owned(),
            },
        )
        .expect("append second");

        let content = fs::read_to_string(&path).expect("read jsonl");
        let lines = content.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains(r#""eventId":"event-1""#));
        assert!(lines[1].contains(r#""eventId":"event-2""#));

        fs::remove_dir_all(dir).expect("cleanup");
    }
}
