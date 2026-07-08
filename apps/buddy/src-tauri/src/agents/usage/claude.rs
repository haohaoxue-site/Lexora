use std::collections::HashSet;

mod discovery;
mod parser;
mod project_path;

pub(super) use discovery::discover_claude_usage_roots;
use parser::read_claude_usage_file;

use super::{
    files::{collect_jsonl_files, matching_root_for_file},
    summary::{aggregate_usage_entries, summarize_rolling_usage_window},
    BuddyUsageRecord, BuddyUsageSourceSnapshot, UsageEntry, MAX_USAGE_FILE_COUNT,
    USAGE_WINDOW_5H_SECONDS, USAGE_WINDOW_WEEK_SECONDS,
};

#[derive(Clone, Debug)]
pub(super) struct ClaudeUsageLoadResult {
    pub(super) source: BuddyUsageSourceSnapshot,
    pub(super) records: Vec<BuddyUsageRecord>,
    pub(super) active_5h_tokens: Option<u64>,
    pub(super) active_5h_resets_at: Option<String>,
    pub(super) active_weekly_tokens: Option<u64>,
    pub(super) active_weekly_resets_at: Option<String>,
}

pub(super) fn load_claude_usage() -> ClaudeUsageLoadResult {
    let roots = discover_claude_usage_roots();
    if roots.is_empty() {
        return ClaudeUsageLoadResult {
            active_5h_resets_at: None,
            active_5h_tokens: None,
            active_weekly_resets_at: None,
            active_weekly_tokens: None,
            records: Vec::new(),
            source: BuddyUsageSourceSnapshot {
                runtime: "claude",
                message: Some("Claude usage files were not found".to_owned()),
                source: "Claude Code JSONL".to_owned(),
                status: "unavailable",
                updated_at: None,
            },
        };
    }

    let mut usage_files = collect_jsonl_files(&roots);
    usage_files.sort();

    let mut seen_entries = HashSet::new();
    let mut entries = Vec::new();
    let mut skipped_files = 0usize;
    for file_path in usage_files.into_iter().take(MAX_USAGE_FILE_COUNT) {
        let Some(projects_root) = matching_root_for_file(&file_path, &roots) else {
            continue;
        };

        let Some(file_entries) = read_claude_usage_file(&file_path, projects_root) else {
            skipped_files += 1;
            continue;
        };

        append_unique_claude_entries(&mut entries, file_entries, &mut seen_entries);
    }

    let latest_timestamp = entries
        .iter()
        .filter_map(|entry| entry.timestamp.as_deref())
        .max()
        .map(str::to_owned);
    let (active_5h_tokens, active_5h_resets_at) =
        summarize_rolling_usage_window(&entries, USAGE_WINDOW_5H_SECONDS);
    let (active_weekly_tokens, active_weekly_resets_at) =
        summarize_rolling_usage_window(&entries, USAGE_WINDOW_WEEK_SECONDS);
    let records = aggregate_usage_entries(entries);
    let status = if records.is_empty() {
        "empty"
    } else {
        "available"
    };
    let message = if skipped_files > 0 {
        Some(format!("{skipped_files} usage files could not be read"))
    } else if records.is_empty() {
        Some("Claude usage files were found, but no token records were parsed".to_owned())
    } else {
        None
    };

    ClaudeUsageLoadResult {
        active_5h_resets_at,
        active_5h_tokens,
        active_weekly_resets_at,
        active_weekly_tokens,
        records,
        source: BuddyUsageSourceSnapshot {
            runtime: "claude",
            message,
            source: roots
                .iter()
                .map(|root| root.display().to_string())
                .collect::<Vec<_>>()
                .join(", "),
            status,
            updated_at: latest_timestamp,
        },
    }
}

fn append_unique_claude_entries(
    entries: &mut Vec<UsageEntry>,
    file_entries: Vec<UsageEntry>,
    seen_entries: &mut HashSet<String>,
) {
    for entry in file_entries {
        if let Some(dedupe_key) = entry.dedupe_key.as_deref() {
            if !seen_entries.insert(dedupe_key.to_owned()) {
                continue;
            }
        }

        entries.push(entry);
    }
}
