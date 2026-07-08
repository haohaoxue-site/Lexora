use std::{
    collections::HashSet,
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
};

use super::super::{
    time::{extract_iso_date, file_modified_timestamp, parse_rfc3339_utc_seconds},
    UsageEntry, MAX_JSONL_LINE_BYTES,
};
use super::{
    rate_limits::parse_codex_rate_limits,
    raw_usage::{
        codex_raw_usage_is_empty_for_headless, codex_raw_usage_is_empty_for_session,
        codex_usage_from_result_value, parse_codex_raw_usage, subtract_codex_raw_usage,
        CodexRawUsage,
    },
    value::{
        codex_model_from_result_value, codex_model_from_value_fields,
        codex_timestamp_from_result_value, codex_timestamp_from_value,
    },
    CodexRateLimits,
};

#[derive(Clone, Debug)]
pub(super) struct ParsedCodexUsageEvent {
    pub(super) entry: UsageEntry,
    rate_limits: Option<CodexRateLimits>,
    reasoning_output_tokens: u64,
}

pub(super) fn read_codex_usage_file(
    file_path: &Path,
    source_dir: &Path,
) -> Option<Vec<ParsedCodexUsageEvent>> {
    let file = File::open(file_path).ok()?;
    let mut events = Vec::new();
    let mut previous_totals = None::<CodexRawUsage>;
    let mut current_model = None::<String>;
    let fallback_timestamp = file_modified_timestamp(file_path);
    let session_id = resolve_codex_session_id(file_path, source_dir);

    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if line.len() > MAX_JSONL_LINE_BYTES {
            continue;
        }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };

        if let Some(event) = parse_codex_session_value(
            &value,
            &session_id,
            &mut previous_totals,
            &mut current_model,
        ) {
            events.push(event);
            continue;
        }

        if let Some(event) =
            parse_codex_headless_value(&value, &session_id, &fallback_timestamp, &mut current_model)
        {
            events.push(event);
        }
    }

    Some(events)
}

fn parse_codex_session_value(
    value: &serde_json::Value,
    session_id: &str,
    previous_totals: &mut Option<CodexRawUsage>,
    current_model: &mut Option<String>,
) -> Option<ParsedCodexUsageEvent> {
    let entry_type = value.get("type").and_then(serde_json::Value::as_str)?;
    let payload = value.get("payload")?;

    if entry_type == "turn_context" {
        if let Some(model) = codex_model_from_value_fields(payload) {
            *current_model = Some(model);
        }
        return None;
    }

    if entry_type != "event_msg"
        || payload.get("type").and_then(serde_json::Value::as_str) != Some("token_count")
    {
        return None;
    }

    let timestamp = codex_timestamp_from_value(value.get("timestamp"))?;
    let info = payload.get("info")?;
    let total_usage = info
        .get("total_token_usage")
        .and_then(parse_codex_raw_usage);
    let raw_usage = info
        .get("last_token_usage")
        .and_then(parse_codex_raw_usage)
        .or_else(|| {
            total_usage
                .as_ref()
                .map(|usage| subtract_codex_raw_usage(usage, previous_totals.as_ref()))
        })?;

    if let Some(total_usage) = total_usage {
        *previous_totals = Some(total_usage);
    }

    if codex_raw_usage_is_empty_for_session(&raw_usage) {
        return None;
    }

    let model = codex_model_from_value_fields(payload)
        .or_else(|| codex_model_from_value_fields(info))
        .or_else(|| current_model.clone())
        .or_else(|| Some("gpt-5".to_owned()));
    if let Some(model) = model.as_ref() {
        *current_model = Some(model.clone());
    }

    let rate_limits = payload.get("rate_limits").and_then(parse_codex_rate_limits);

    Some(create_codex_usage_event(
        session_id,
        timestamp,
        model,
        raw_usage,
        rate_limits,
    ))
}

fn parse_codex_headless_value(
    value: &serde_json::Value,
    session_id: &str,
    fallback_timestamp: &str,
    current_model: &mut Option<String>,
) -> Option<ParsedCodexUsageEvent> {
    let raw_usage = codex_usage_from_result_value(value)?;
    if codex_raw_usage_is_empty_for_headless(&raw_usage) {
        return None;
    }

    let timestamp =
        codex_timestamp_from_result_value(value).unwrap_or_else(|| fallback_timestamp.to_owned());
    let model = codex_model_from_result_value(value)
        .or_else(|| current_model.clone())
        .or_else(|| Some("gpt-5".to_owned()));
    if let Some(model) = model.as_ref() {
        *current_model = Some(model.clone());
    }

    Some(create_codex_usage_event(
        session_id, timestamp, model, raw_usage, None,
    ))
}

fn create_codex_usage_event(
    session_id: &str,
    timestamp: String,
    model: Option<String>,
    raw_usage: CodexRawUsage,
    rate_limits: Option<CodexRateLimits>,
) -> ParsedCodexUsageEvent {
    let cache_read_tokens = raw_usage.cached_input_tokens.min(raw_usage.input_tokens);
    ParsedCodexUsageEvent {
        entry: UsageEntry {
            runtime: "codex",
            cache_creation_tokens: 0,
            cache_read_tokens,
            date: extract_iso_date(&timestamp),
            dedupe_key: None,
            input_tokens: raw_usage.input_tokens,
            model,
            output_tokens: raw_usage.output_tokens,
            project_path: None,
            session_id: Some(session_id.to_owned()),
            timestamp_unix_seconds: parse_rfc3339_utc_seconds(&timestamp),
            timestamp: Some(timestamp),
            total_tokens: Some(raw_usage.total_tokens),
        },
        rate_limits,
        reasoning_output_tokens: raw_usage.reasoning_output_tokens,
    }
}

pub(super) fn dedupe_codex_usage_events(events: &mut Vec<ParsedCodexUsageEvent>) {
    let mut seen = HashSet::new();
    events.retain(|event| {
        seen.insert((
            event.entry.timestamp.clone(),
            event.entry.model.clone(),
            event.entry.input_tokens,
            event.entry.cache_read_tokens,
            event.entry.output_tokens,
            event.reasoning_output_tokens,
            event.entry.total_tokens,
        ))
    });
}

pub(super) fn latest_codex_rate_limits(
    events: &[ParsedCodexUsageEvent],
) -> Option<CodexRateLimits> {
    events
        .iter()
        .filter_map(|event| {
            event
                .rate_limits
                .as_ref()
                .map(|rate_limits| (event.entry.timestamp.as_deref(), rate_limits))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, rate_limits)| rate_limits.clone())
}

fn resolve_codex_session_id(file_path: &Path, source_dir: &Path) -> String {
    let relative = file_path.strip_prefix(source_dir).unwrap_or(file_path);
    let session_id = relative
        .with_extension("")
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");

    if session_id.is_empty() {
        "unknown".to_owned()
    } else {
        session_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn parses_codex_total_usage_by_subtracting_previous_totals() {
        let root = create_temp_usage_root("codex-diff");
        let file_path = root.join("session.jsonl");
        fs::write(
            &file_path,
            [
                r#"{"timestamp":"2026-01-02T00:00:00.000Z","type":"turn_context","payload":{"model":"gpt-5.2-codex"}}"#,
                r#"{"timestamp":"2026-01-02T00:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":10,"output_tokens":50,"reasoning_output_tokens":4,"total_tokens":150}}}}"#,
                r#"{"timestamp":"2026-01-02T00:00:02.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":260,"cached_input_tokens":60,"output_tokens":90,"reasoning_output_tokens":9,"total_tokens":350}}}}"#,
            ].join("\n"),
        )
        .expect("write codex fixture");

        let events = read_codex_usage_file(&file_path, &root).expect("codex events");

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].entry.session_id.as_deref(), Some("session"));
        assert_eq!(events[0].entry.model.as_deref(), Some("gpt-5.2-codex"));
        assert_eq!(events[0].entry.input_tokens, 100);
        assert_eq!(events[0].entry.cache_read_tokens, 10);
        assert_eq!(events[0].entry.output_tokens, 50);
        assert_eq!(events[0].reasoning_output_tokens, 4);
        assert_eq!(events[0].entry.total_tokens, Some(150));
        assert_eq!(events[1].entry.input_tokens, 160);
        assert_eq!(events[1].entry.cache_read_tokens, 50);
        assert_eq!(events[1].entry.output_tokens, 40);
        assert_eq!(events[1].reasoning_output_tokens, 5);
        assert_eq!(events[1].entry.total_tokens, Some(200));

        fs::remove_dir_all(root).expect("cleanup temp codex fixture");
    }

    #[test]
    fn parses_codex_last_usage_rate_limits_and_dedupes_replayed_events() {
        let root = create_temp_usage_root("codex-last");
        let file_path = root.join("2026/01/02/session.jsonl");
        fs::create_dir_all(file_path.parent().expect("fixture parent"))
            .expect("create fixture dir");
        fs::write(
            &file_path,
            [
                r#"{"timestamp":"2026-01-02T00:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":120,"cached_input_tokens":140,"output_tokens":30,"reasoning_output_tokens":6,"total_tokens":150},"model":"gpt-5.3-codex"},"rate_limits":{"primary":{"used_percent":42.4,"resets_at":1767315600},"secondary":{"used_percent":8.8,"resets_at":1767920400}}}}"#,
                r#"{"timestamp":"2026-01-02T00:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":120,"cached_input_tokens":140,"output_tokens":30,"reasoning_output_tokens":6,"total_tokens":150},"model":"gpt-5.3-codex"},"rate_limits":{"primary":{"used_percent":42.4,"resets_at":1767315600},"secondary":{"used_percent":8.8,"resets_at":1767920400}}}}"#,
            ].join("\n"),
        )
        .expect("write codex fixture");

        let mut events = read_codex_usage_file(&file_path, &root).expect("codex events");
        dedupe_codex_usage_events(&mut events);
        let rate_limits = latest_codex_rate_limits(&events).expect("rate limits");

        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].entry.session_id.as_deref(),
            Some("2026/01/02/session")
        );
        assert_eq!(events[0].entry.cache_read_tokens, 120);
        assert_eq!(events[0].entry.output_tokens, 30);
        assert_eq!(events[0].reasoning_output_tokens, 6);
        assert_eq!(events[0].entry.total_tokens, Some(150));
        assert_eq!(
            rate_limits.primary.and_then(|window| window.used_percent),
            Some(42.4)
        );
        assert_eq!(
            rate_limits.secondary.and_then(|window| window.used_percent),
            Some(8.8)
        );

        fs::remove_dir_all(root).expect("cleanup temp codex fixture");
    }

    #[test]
    fn parses_codex_exec_json_usage_aliases() {
        let root = create_temp_usage_root("codex-exec");
        let file_path = root.join("run.jsonl");
        fs::write(
            &file_path,
            r#"{"type":"result","data":{"timestamp":"2026-01-02T03:05:05.000Z","model_name":"gpt-5.2-codex","usage":{"prompt_tokens":"50","cached_tokens":5,"completion_tokens":12,"reasoning_tokens":1,"total_tokens":0}}}"#,
        )
        .expect("write codex fixture");

        let events = read_codex_usage_file(&file_path, &root).expect("codex events");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].entry.session_id.as_deref(), Some("run"));
        assert_eq!(events[0].entry.model.as_deref(), Some("gpt-5.2-codex"));
        assert_eq!(events[0].entry.input_tokens, 50);
        assert_eq!(events[0].entry.cache_read_tokens, 5);
        assert_eq!(events[0].entry.output_tokens, 12);
        assert_eq!(events[0].reasoning_output_tokens, 1);
        assert_eq!(events[0].entry.total_tokens, Some(63));

        fs::remove_dir_all(root).expect("cleanup temp codex fixture");
    }

    fn create_temp_usage_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "lexora-buddy-usage-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create temp usage root");
        root
    }
}
