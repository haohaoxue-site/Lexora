const MAX_USAGE_FILE_COUNT: usize = 4096;
const MAX_JSONL_LINE_BYTES: usize = 2 * 1024 * 1024;
const USAGE_WINDOW_5H_SECONDS: u64 = 5 * 60 * 60;
const USAGE_WINDOW_WEEK_SECONDS: u64 = 7 * 24 * 60 * 60;

mod cache;
mod claude;
mod codex;
mod files;
mod summary;
mod time;

use self::{
    cache::{
        collect_usage_cache_fingerprint, read_cached_usage_snapshot, write_cached_usage_snapshot,
    },
    claude::load_claude_usage,
    codex::load_codex_usage,
    summary::{create_usage_windows, summarize_usage_records},
    time::current_unix_seconds,
};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyUsageSnapshot {
    pub sources: Vec<BuddyUsageSourceSnapshot>,
    pub totals: BuddyUsageTotals,
    pub records: Vec<BuddyUsageRecord>,
    pub windows: Vec<BuddyUsageWindow>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyUsageSourceSnapshot {
    pub runtime: &'static str,
    pub status: &'static str,
    pub source: String,
    pub updated_at: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyUsageTotals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub total_tokens: u64,
    pub record_count: usize,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyUsageRecord {
    pub runtime: &'static str,
    pub date: Option<String>,
    pub session_id: Option<String>,
    pub project_path: Option<String>,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyUsageWindow {
    pub runtime: &'static str,
    pub key: &'static str,
    pub status: &'static str,
    pub used_tokens: Option<u64>,
    pub percentage: Option<u8>,
    pub resets_at: Option<String>,
}

#[derive(Clone, Debug)]
struct UsageEntry {
    runtime: &'static str,
    date: Option<String>,
    timestamp: Option<String>,
    timestamp_unix_seconds: Option<u64>,
    session_id: Option<String>,
    project_path: Option<String>,
    model: Option<String>,
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    total_tokens: Option<u64>,
    dedupe_key: Option<String>,
}

pub fn load_buddy_usage_snapshot() -> BuddyUsageSnapshot {
    let fingerprint = collect_usage_cache_fingerprint();
    let now = current_unix_seconds();

    if let Some(snapshot) = read_cached_usage_snapshot(&fingerprint, now) {
        return snapshot;
    }

    let snapshot = load_buddy_usage_snapshot_uncached();
    write_cached_usage_snapshot(fingerprint, snapshot.clone(), now);

    snapshot
}

pub fn create_unavailable_usage_snapshot(message: String) -> BuddyUsageSnapshot {
    BuddyUsageSnapshot {
        records: Vec::new(),
        sources: vec![
            BuddyUsageSourceSnapshot {
                runtime: "codex",
                message: Some(message.clone()),
                source: "codex usage files".to_owned(),
                status: "unavailable",
                updated_at: None,
            },
            BuddyUsageSourceSnapshot {
                runtime: "claude",
                message: Some(message),
                source: "claude usage files".to_owned(),
                status: "unavailable",
                updated_at: None,
            },
        ],
        totals: BuddyUsageTotals::default(),
        windows: Vec::new(),
    }
}

fn load_buddy_usage_snapshot_uncached() -> BuddyUsageSnapshot {
    let codex_usage = load_codex_usage();
    let claude_usage = load_claude_usage();
    let mut records = codex_usage.records.clone();
    records.extend(claude_usage.records.clone());
    records.sort_by(|left, right| {
        right
            .date
            .cmp(&left.date)
            .then_with(|| left.runtime.cmp(right.runtime))
            .then_with(|| left.model.cmp(&right.model))
            .then_with(|| left.session_id.cmp(&right.session_id))
    });
    let windows = create_usage_windows(&codex_usage, &claude_usage);

    BuddyUsageSnapshot {
        sources: vec![codex_usage.source, claude_usage.source],
        totals: summarize_usage_records(&records),
        windows,
        records,
    }
}

fn read_u64_field(value: &serde_json::Value, field: &str) -> Option<u64> {
    value.get(field).and_then(|field_value| {
        field_value
            .as_u64()
            .or_else(|| {
                field_value
                    .as_i64()
                    .and_then(|value| u64::try_from(value).ok())
            })
            .or_else(|| field_value.as_str()?.trim().parse::<u64>().ok())
    })
}

fn read_u64_field_any(value: &serde_json::Value, fields: &[&str]) -> u64 {
    fields
        .iter()
        .find_map(|field| read_u64_field(value, field))
        .unwrap_or(0)
}
