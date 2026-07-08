use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

use super::{
    claude::ClaudeUsageLoadResult,
    codex::{CodexRateLimitWindow, CodexUsageLoadResult},
    time::format_unix_seconds_utc,
    BuddyUsageRecord, BuddyUsageTotals, BuddyUsageWindow, UsageEntry,
};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct UsageAggregateKey {
    runtime: &'static str,
    date: Option<String>,
    session_id: Option<String>,
    project_path: Option<String>,
    model: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct UsageAccumulator {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    total_tokens: u64,
}

impl UsageAccumulator {
    fn add_entry(&mut self, entry: &UsageEntry) {
        self.input_tokens = self.input_tokens.saturating_add(entry.input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(entry.output_tokens);
        self.cache_creation_tokens = self
            .cache_creation_tokens
            .saturating_add(entry.cache_creation_tokens);
        self.cache_read_tokens = self
            .cache_read_tokens
            .saturating_add(entry.cache_read_tokens);
        self.total_tokens = self
            .total_tokens
            .saturating_add(entry.total_tokens.unwrap_or_else(|| {
                entry
                    .input_tokens
                    .saturating_add(entry.output_tokens)
                    .saturating_add(entry.cache_creation_tokens)
                    .saturating_add(entry.cache_read_tokens)
            }));
    }

    fn add_record(&mut self, record: &BuddyUsageRecord) {
        self.input_tokens = self.input_tokens.saturating_add(record.input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(record.output_tokens);
        self.cache_creation_tokens = self
            .cache_creation_tokens
            .saturating_add(record.cache_creation_tokens);
        self.cache_read_tokens = self
            .cache_read_tokens
            .saturating_add(record.cache_read_tokens);
        self.total_tokens = self.total_tokens.saturating_add(record.total_tokens);
    }

    fn total_tokens(&self) -> u64 {
        self.total_tokens
    }
}

pub(in crate::agents::usage) fn aggregate_usage_entries(
    entries: Vec<UsageEntry>,
) -> Vec<BuddyUsageRecord> {
    let mut aggregates: BTreeMap<UsageAggregateKey, UsageAccumulator> = BTreeMap::new();

    for entry in &entries {
        let key = UsageAggregateKey {
            runtime: entry.runtime,
            date: entry.date.clone(),
            model: entry.model.clone(),
            project_path: entry.project_path.clone(),
            session_id: entry.session_id.clone(),
        };
        aggregates.entry(key).or_default().add_entry(entry);
    }

    let mut records = aggregates
        .into_iter()
        .map(|(key, accumulator)| BuddyUsageRecord {
            runtime: key.runtime,
            cache_creation_tokens: accumulator.cache_creation_tokens,
            cache_read_tokens: accumulator.cache_read_tokens,
            date: key.date,
            input_tokens: accumulator.input_tokens,
            model: key.model,
            output_tokens: accumulator.output_tokens,
            project_path: key.project_path,
            session_id: key.session_id,
            total_tokens: accumulator.total_tokens(),
        })
        .collect::<Vec<_>>();

    records.sort_by(|left, right| {
        right
            .date
            .cmp(&left.date)
            .then_with(|| left.runtime.cmp(right.runtime))
            .then_with(|| left.model.cmp(&right.model))
            .then_with(|| left.session_id.cmp(&right.session_id))
    });
    records
}

pub(in crate::agents::usage) fn summarize_usage_records(
    records: &[BuddyUsageRecord],
) -> BuddyUsageTotals {
    let mut accumulator = UsageAccumulator::default();
    for record in records {
        accumulator.add_record(record);
    }

    BuddyUsageTotals {
        cache_creation_tokens: accumulator.cache_creation_tokens,
        cache_read_tokens: accumulator.cache_read_tokens,
        input_tokens: accumulator.input_tokens,
        output_tokens: accumulator.output_tokens,
        record_count: records.len(),
        total_tokens: accumulator.total_tokens(),
    }
}

pub(in crate::agents::usage) fn summarize_rolling_usage_window(
    entries: &[UsageEntry],
    window_seconds: u64,
) -> (Option<u64>, Option<String>) {
    if entries.is_empty() {
        return (None, None);
    }

    let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return (None, None);
    };

    let window_start = now.as_secs().saturating_sub(window_seconds);
    let mut active_tokens = 0u64;
    let mut oldest_active_timestamp = None::<u64>;

    for entry in entries {
        let Some(timestamp) = entry.timestamp_unix_seconds else {
            continue;
        };

        if timestamp < window_start {
            continue;
        }

        let entry_tokens = entry
            .input_tokens
            .saturating_add(entry.output_tokens)
            .saturating_add(entry.cache_creation_tokens)
            .saturating_add(entry.cache_read_tokens);
        active_tokens = active_tokens.saturating_add(entry_tokens);
        oldest_active_timestamp =
            Some(oldest_active_timestamp.map_or(timestamp, |oldest| oldest.min(timestamp)));
    }

    if active_tokens == 0 {
        return (Some(0), None);
    }

    (
        Some(active_tokens),
        oldest_active_timestamp
            .and_then(|timestamp| timestamp.checked_add(window_seconds))
            .and_then(format_unix_seconds_utc),
    )
}

pub(super) fn create_usage_windows(
    codex_usage: &CodexUsageLoadResult,
    claude_usage: &ClaudeUsageLoadResult,
) -> Vec<BuddyUsageWindow> {
    let claude_status = if claude_usage.active_5h_tokens.is_some() {
        "available"
    } else {
        claude_usage.source.status
    };

    vec![
        create_codex_usage_window(
            "codex_5h_limit",
            codex_usage
                .latest_rate_limits
                .as_ref()
                .and_then(|limits| limits.primary.as_ref()),
            codex_usage.source.status,
        ),
        create_codex_usage_window(
            "codex_weekly_limit",
            codex_usage
                .latest_rate_limits
                .as_ref()
                .and_then(|limits| limits.secondary.as_ref()),
            codex_usage.source.status,
        ),
        BuddyUsageWindow {
            runtime: "claude",
            key: "claude_5h_limit",
            percentage: None,
            resets_at: claude_usage.active_5h_resets_at.clone(),
            status: claude_status,
            used_tokens: claude_usage.active_5h_tokens,
        },
        BuddyUsageWindow {
            runtime: "claude",
            key: "claude_weekly_limit",
            percentage: None,
            resets_at: claude_usage.active_weekly_resets_at.clone(),
            status: if claude_usage.active_weekly_tokens.is_some() {
                "available"
            } else {
                claude_usage.source.status
            },
            used_tokens: claude_usage.active_weekly_tokens,
        },
    ]
}

fn create_codex_usage_window(
    key: &'static str,
    rate_limit: Option<&CodexRateLimitWindow>,
    source_status: &'static str,
) -> BuddyUsageWindow {
    BuddyUsageWindow {
        runtime: "codex",
        key,
        percentage: rate_limit
            .and_then(|limit| limit.used_percent)
            .map(|percent| percent.round().clamp(0.0, 100.0) as u8),
        resets_at: rate_limit
            .and_then(|limit| limit.resets_at_unix_seconds)
            .and_then(format_unix_seconds_utc),
        status: if rate_limit.is_some() {
            "available"
        } else {
            source_status
        },
        used_tokens: None,
    }
}
