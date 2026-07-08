use std::{
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
};

use super::super::{
    read_u64_field,
    time::{extract_iso_date, parse_rfc3339_utc_seconds},
    UsageEntry, MAX_JSONL_LINE_BYTES,
};
use super::project_path::resolve_claude_project_path;

pub(super) fn read_claude_usage_file(
    file_path: &Path,
    projects_root: &Path,
) -> Option<Vec<UsageEntry>> {
    let file = File::open(file_path).ok()?;
    let mut entries = Vec::new();

    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if line.len() > MAX_JSONL_LINE_BYTES {
            continue;
        }

        let Some(entry) = parse_claude_usage_entry(&line, file_path, projects_root) else {
            continue;
        };

        entries.push(entry);
    }

    Some(entries)
}

fn parse_claude_usage_entry(
    line: &str,
    file_path: &Path,
    projects_root: &Path,
) -> Option<UsageEntry> {
    let value = serde_json::from_str::<serde_json::Value>(line).ok()?;
    if value
        .get("isApiErrorMessage")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }

    let message = value.get("message")?;
    let usage = message.get("usage")?;
    let input_tokens = read_u64_field(usage, "input_tokens").unwrap_or(0);
    let output_tokens = read_u64_field(usage, "output_tokens").unwrap_or(0);
    let cache_creation_tokens = read_u64_field(usage, "cache_creation_input_tokens")
        .unwrap_or_else(|| read_claude_cache_creation_tokens(usage));
    let cache_read_tokens = read_u64_field(usage, "cache_read_input_tokens").unwrap_or(0);

    if input_tokens == 0
        && output_tokens == 0
        && cache_creation_tokens == 0
        && cache_read_tokens == 0
    {
        return None;
    }

    let timestamp = value
        .get("timestamp")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let date = timestamp.as_deref().and_then(extract_iso_date);
    let timestamp_unix_seconds = timestamp.as_deref().and_then(parse_rfc3339_utc_seconds);
    let request_id = value
        .get("requestId")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let message_id = message
        .get("id")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);

    Some(UsageEntry {
        runtime: "claude",
        cache_creation_tokens,
        cache_read_tokens,
        date,
        dedupe_key: create_usage_dedupe_key(message_id.as_deref(), request_id.as_deref()),
        input_tokens,
        model: message
            .get("model")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        output_tokens,
        project_path: resolve_claude_project_path(file_path, projects_root),
        session_id: value
            .get("sessionId")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        timestamp,
        timestamp_unix_seconds,
        total_tokens: None,
    })
}

fn read_claude_cache_creation_tokens(usage: &serde_json::Value) -> u64 {
    let Some(cache_creation) = usage.get("cache_creation") else {
        return 0;
    };

    read_u64_field(cache_creation, "ephemeral_5m_input_tokens")
        .unwrap_or(0)
        .saturating_add(read_u64_field(cache_creation, "ephemeral_1h_input_tokens").unwrap_or(0))
}

fn create_usage_dedupe_key(message_id: Option<&str>, request_id: Option<&str>) -> Option<String> {
    match (message_id, request_id) {
        (Some(message_id), Some(request_id)) => Some(format!("{message_id}|{request_id}")),
        (Some(message_id), None) => Some(message_id.to_owned()),
        (None, Some(request_id)) => Some(request_id.to_owned()),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::summary::{aggregate_usage_entries, summarize_usage_records};
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_claude_jsonl_usage_entry() {
        let projects_root = PathBuf::from("/tmp/claude/projects");
        let file_path = projects_root.join("-home-user-repo/session.jsonl");
        let entry = parse_claude_usage_entry(
            r#"{"timestamp":"2026-06-30T08:12:13.000Z","sessionId":"session-1","requestId":"request-1","message":{"id":"message-1","model":"claude-sonnet-4","usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":30,"cache_read_input_tokens":40}}}"#,
            &file_path,
            &projects_root,
        )
        .expect("usage entry");

        assert_eq!(entry.date.as_deref(), Some("2026-06-30"));
        assert_eq!(entry.session_id.as_deref(), Some("session-1"));
        assert_eq!(entry.project_path.as_deref(), Some("-home-user-repo"));
        assert_eq!(entry.input_tokens, 10);
        assert_eq!(entry.output_tokens, 20);
        assert_eq!(entry.cache_creation_tokens, 30);
        assert_eq!(entry.cache_read_tokens, 40);
    }

    #[test]
    fn aggregates_claude_usage_by_day_session_project_and_model() {
        let projects_root = PathBuf::from("/tmp/claude/projects");
        let file_path = projects_root.join("-home-user-repo/session.jsonl");
        let entries = vec![
            parse_claude_usage_entry(
                r#"{"timestamp":"2026-06-30T08:12:13.000Z","sessionId":"session-1","requestId":"request-1","message":{"id":"message-1","model":"claude-sonnet-4","usage":{"input_tokens":10,"output_tokens":20}}}"#,
                &file_path,
                &projects_root,
            )
            .expect("first entry"),
            parse_claude_usage_entry(
                r#"{"timestamp":"2026-06-30T09:12:13.000Z","sessionId":"session-1","requestId":"request-2","message":{"id":"message-2","model":"claude-sonnet-4","usage":{"input_tokens":3,"output_tokens":4,"cache_creation":{"ephemeral_5m_input_tokens":5,"ephemeral_1h_input_tokens":6},"cache_read_input_tokens":7}}}"#,
                &file_path,
                &projects_root,
            )
            .expect("second entry"),
        ];

        let records = aggregate_usage_entries(entries);
        let totals = summarize_usage_records(&records);

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].input_tokens, 13);
        assert_eq!(records[0].output_tokens, 24);
        assert_eq!(records[0].cache_creation_tokens, 11);
        assert_eq!(records[0].cache_read_tokens, 7);
        assert_eq!(totals.total_tokens, 55);
    }
}
