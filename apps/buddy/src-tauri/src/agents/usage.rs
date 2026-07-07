use std::{
    collections::{BTreeMap, HashSet},
    env,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

const CLAUDE_DEFAULT_CONFIG_DIR: &str = ".claude";
const CLAUDE_XDG_CONFIG_DIR: &str = ".config/claude";
const CODEX_DEFAULT_HOME_DIR: &str = ".codex";
const MAX_USAGE_FILE_COUNT: usize = 4096;
const MAX_JSONL_LINE_BYTES: usize = 2 * 1024 * 1024;
const USAGE_WINDOW_5H_SECONDS: u64 = 5 * 60 * 60;
const USAGE_WINDOW_WEEK_SECONDS: u64 = 7 * 24 * 60 * 60;

static USAGE_SNAPSHOT_CACHE: OnceLock<Mutex<Option<UsageSnapshotCacheEntry>>> = OnceLock::new();

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
struct CodexUsageLoadResult {
    source: BuddyUsageSourceSnapshot,
    records: Vec<BuddyUsageRecord>,
    latest_rate_limits: Option<CodexRateLimits>,
}

#[derive(Clone, Debug)]
struct CodexUsageSource {
    dir: PathBuf,
    dedupe_scope: PathBuf,
}

#[derive(Clone, Debug)]
struct ClaudeUsageLoadResult {
    source: BuddyUsageSourceSnapshot,
    records: Vec<BuddyUsageRecord>,
    active_5h_tokens: Option<u64>,
    active_5h_resets_at: Option<String>,
    active_weekly_tokens: Option<u64>,
    active_weekly_resets_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct UsageCacheFingerprint {
    codex_sources: Vec<PathBuf>,
    codex_files: Vec<UsageFileSignature>,
    claude_roots: Vec<PathBuf>,
    claude_files: Vec<UsageFileSignature>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct UsageFileSignature {
    path: PathBuf,
    modified_unix_seconds: Option<u64>,
    modified_subsec_nanos: u32,
    len: u64,
}

#[derive(Clone, Debug)]
struct UsageSnapshotCacheEntry {
    fingerprint: UsageCacheFingerprint,
    snapshot: BuddyUsageSnapshot,
    expires_at_unix_seconds: Option<u64>,
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

#[derive(Clone, Debug)]
struct CodexRateLimits {
    primary: Option<CodexRateLimitWindow>,
    secondary: Option<CodexRateLimitWindow>,
}

#[derive(Clone, Debug)]
struct CodexRateLimitWindow {
    used_percent: Option<f64>,
    resets_at_unix_seconds: Option<u64>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct CodexRawUsage {
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
}

#[derive(Clone, Debug)]
struct ParsedCodexUsageEvent {
    entry: UsageEntry,
    rate_limits: Option<CodexRateLimits>,
    reasoning_output_tokens: u64,
}

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

fn read_cached_usage_snapshot(
    fingerprint: &UsageCacheFingerprint,
    now_unix_seconds: u64,
) -> Option<BuddyUsageSnapshot> {
    let cache = USAGE_SNAPSHOT_CACHE.get_or_init(|| Mutex::new(None));
    let guard = cache.lock().ok()?;
    let entry = guard.as_ref()?;

    should_reuse_usage_snapshot_cache(
        &entry.fingerprint,
        fingerprint,
        entry.expires_at_unix_seconds,
        now_unix_seconds,
    )
    .then(|| entry.snapshot.clone())
}

fn write_cached_usage_snapshot(
    fingerprint: UsageCacheFingerprint,
    snapshot: BuddyUsageSnapshot,
    now_unix_seconds: u64,
) {
    let expires_at_unix_seconds =
        resolve_usage_snapshot_cache_expiration(&snapshot, now_unix_seconds);
    let cache = USAGE_SNAPSHOT_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(UsageSnapshotCacheEntry {
            expires_at_unix_seconds,
            fingerprint,
            snapshot,
        });
    }
}

fn should_reuse_usage_snapshot_cache(
    cached_fingerprint: &UsageCacheFingerprint,
    current_fingerprint: &UsageCacheFingerprint,
    expires_at_unix_seconds: Option<u64>,
    now_unix_seconds: u64,
) -> bool {
    if cached_fingerprint != current_fingerprint {
        return false;
    }

    match expires_at_unix_seconds {
        Some(expires_at) => now_unix_seconds < expires_at,
        None => true,
    }
}

fn resolve_usage_snapshot_cache_expiration(
    snapshot: &BuddyUsageSnapshot,
    now_unix_seconds: u64,
) -> Option<u64> {
    snapshot
        .windows
        .iter()
        .filter_map(|window| window.resets_at.as_deref())
        .filter_map(parse_rfc3339_utc_seconds)
        .filter(|resets_at| *resets_at > now_unix_seconds)
        .min()
}

fn collect_usage_cache_fingerprint() -> UsageCacheFingerprint {
    let codex_sources = discover_codex_usage_sources();
    let mut codex_source_paths = codex_sources
        .iter()
        .map(|source| source.dir.clone())
        .collect::<Vec<_>>();
    codex_source_paths.sort();
    let mut codex_files = collect_deduped_codex_usage_files(&codex_sources)
        .into_iter()
        .take(MAX_USAGE_FILE_COUNT)
        .map(|(_, file_path)| create_usage_file_signature(file_path))
        .collect::<Vec<_>>();
    codex_files.sort_by(|left, right| left.path.cmp(&right.path));

    let mut claude_roots = discover_claude_usage_roots();
    claude_roots.sort();
    let mut claude_files = collect_jsonl_files(&claude_roots)
        .into_iter()
        .take(MAX_USAGE_FILE_COUNT)
        .map(create_usage_file_signature)
        .collect::<Vec<_>>();
    claude_files.sort_by(|left, right| left.path.cmp(&right.path));

    UsageCacheFingerprint {
        claude_files,
        claude_roots,
        codex_files,
        codex_sources: codex_source_paths,
    }
}

fn create_usage_file_signature(path: PathBuf) -> UsageFileSignature {
    let metadata = fs::metadata(&path).ok();
    let modified = metadata
        .as_ref()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok());

    UsageFileSignature {
        len: metadata.as_ref().map_or(0, fs::Metadata::len),
        modified_subsec_nanos: modified.map_or(0, |duration| duration.subsec_nanos()),
        modified_unix_seconds: modified.map(|duration| duration.as_secs()),
        path,
    }
}

fn current_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn load_codex_usage() -> CodexUsageLoadResult {
    let sources = discover_codex_usage_sources();
    if sources.is_empty() {
        return CodexUsageLoadResult {
            latest_rate_limits: None,
            records: Vec::new(),
            source: BuddyUsageSourceSnapshot {
                runtime: "codex",
                message: Some("Codex session usage files were not found".to_owned()),
                source: "Codex sessions JSONL".to_owned(),
                status: "unavailable",
                updated_at: None,
            },
        };
    }

    let mut usage_files = collect_deduped_codex_usage_files(&sources);
    usage_files.sort_by(|left, right| left.1.cmp(&right.1));

    let mut events = Vec::new();
    let mut skipped_files = 0usize;

    for (source_dir, file_path) in usage_files.into_iter().take(MAX_USAGE_FILE_COUNT) {
        match read_codex_usage_file(&file_path, &source_dir) {
            Some(mut file_events) => events.append(&mut file_events),
            None => skipped_files += 1,
        }
    }

    dedupe_codex_usage_events(&mut events);

    let latest_rate_limits = latest_codex_rate_limits(&events);
    let entries = events
        .into_iter()
        .map(|event| event.entry)
        .collect::<Vec<_>>();
    let latest_timestamp = entries
        .iter()
        .filter_map(|entry| entry.timestamp.as_deref())
        .max()
        .map(str::to_owned);
    let records = aggregate_usage_entries(entries);
    let status = if records.is_empty() {
        "empty"
    } else {
        "available"
    };
    let message = if skipped_files > 0 {
        Some(format!(
            "{skipped_files} Codex session files could not be read"
        ))
    } else if records.is_empty() {
        Some("Codex session files were found, but no token records were parsed".to_owned())
    } else {
        None
    };

    CodexUsageLoadResult {
        latest_rate_limits,
        records,
        source: BuddyUsageSourceSnapshot {
            runtime: "codex",
            message,
            source: sources
                .iter()
                .map(|source| source.dir.display().to_string())
                .collect::<Vec<_>>()
                .join(", "),
            status,
            updated_at: latest_timestamp,
        },
    }
}

fn discover_codex_usage_sources() -> Vec<CodexUsageSource> {
    let homes = if let Ok(raw_codex_homes) = env::var("CODEX_HOME") {
        raw_codex_homes
            .split(',')
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .collect::<Vec<_>>()
    } else {
        let Some(home) = env::var_os("HOME").map(PathBuf::from) else {
            return Vec::new();
        };
        vec![home.join(CODEX_DEFAULT_HOME_DIR)]
    };

    let mut sources = Vec::new();
    let mut seen = HashSet::new();
    for home in homes {
        let sessions = home.join("sessions");
        let archived_sessions = home.join("archived_sessions");
        let mut found_usage_dir = false;

        for dir in [sessions, archived_sessions] {
            if !dir.is_dir() {
                continue;
            }
            let dir = fs::canonicalize(&dir).unwrap_or(dir);
            if seen.insert(dir.clone()) {
                sources.push(CodexUsageSource {
                    dedupe_scope: home.clone(),
                    dir,
                });
            }
            found_usage_dir = true;
        }

        if !found_usage_dir && home.is_dir() {
            let dir = fs::canonicalize(&home).unwrap_or(home.clone());
            if seen.insert(dir.clone()) {
                sources.push(CodexUsageSource {
                    dedupe_scope: home,
                    dir,
                });
            }
        }
    }

    sources
}

fn collect_deduped_codex_usage_files(sources: &[CodexUsageSource]) -> Vec<(PathBuf, PathBuf)> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();

    for source in sources {
        for file_path in collect_jsonl_files(std::slice::from_ref(&source.dir)) {
            let relative = file_path
                .strip_prefix(&source.dir)
                .unwrap_or(&file_path)
                .to_path_buf();
            if seen.insert((source.dedupe_scope.clone(), relative)) {
                files.push((source.dir.clone(), file_path));
            }
        }
    }

    files
}

fn read_codex_usage_file(
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

fn dedupe_codex_usage_events(events: &mut Vec<ParsedCodexUsageEvent>) {
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

fn latest_codex_rate_limits(events: &[ParsedCodexUsageEvent]) -> Option<CodexRateLimits> {
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

fn parse_codex_raw_usage(value: &serde_json::Value) -> Option<CodexRawUsage> {
    if !value.is_object() {
        return None;
    }

    let input_tokens = read_u64_field_any(value, &["input_tokens", "prompt_tokens", "input"]);
    let output_tokens =
        read_u64_field_any(value, &["output_tokens", "completion_tokens", "output"]);
    let reasoning_output_tokens =
        read_u64_field_any(value, &["reasoning_output_tokens", "reasoning_tokens"]);
    let total_fallback = input_tokens
        .saturating_add(output_tokens)
        .saturating_add(reasoning_output_tokens);
    let total_tokens = read_u64_field(value, "total_tokens")
        .filter(|total| *total > 0 || total_fallback == 0)
        .unwrap_or(total_fallback);

    Some(CodexRawUsage {
        cached_input_tokens: read_u64_field_any(
            value,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cached_tokens",
            ],
        ),
        input_tokens,
        output_tokens,
        reasoning_output_tokens,
        total_tokens,
    })
}

fn subtract_codex_raw_usage(
    current: &CodexRawUsage,
    previous: Option<&CodexRawUsage>,
) -> CodexRawUsage {
    CodexRawUsage {
        cached_input_tokens: current
            .cached_input_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.cached_input_tokens)),
        input_tokens: current
            .input_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.input_tokens)),
        output_tokens: current
            .output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.output_tokens)),
        reasoning_output_tokens: current
            .reasoning_output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.reasoning_output_tokens)),
        total_tokens: current
            .total_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.total_tokens)),
    }
}

fn codex_raw_usage_is_empty_for_session(usage: &CodexRawUsage) -> bool {
    usage.input_tokens == 0
        && usage.cached_input_tokens == 0
        && usage.output_tokens == 0
        && usage.reasoning_output_tokens == 0
}

fn codex_raw_usage_is_empty_for_headless(usage: &CodexRawUsage) -> bool {
    codex_raw_usage_is_empty_for_session(usage) && usage.total_tokens == 0
}

fn codex_usage_from_result_value(value: &serde_json::Value) -> Option<CodexRawUsage> {
    value
        .get("usage")
        .and_then(parse_codex_raw_usage)
        .or_else(|| {
            value
                .get("data")
                .and_then(|data| data.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
        .or_else(|| {
            value
                .get("response")
                .and_then(|response| response.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
}

fn codex_model_from_result_value(value: &serde_json::Value) -> Option<String> {
    codex_model_from_value_fields(value)
        .or_else(|| value.get("data").and_then(codex_model_from_value_fields))
        .or_else(|| value.get("result").and_then(codex_model_from_value_fields))
        .or_else(|| {
            value
                .get("response")
                .and_then(codex_model_from_value_fields)
        })
}

fn codex_model_from_value_fields(value: &serde_json::Value) -> Option<String> {
    non_empty_value_string(value.get("model"))
        .or_else(|| non_empty_value_string(value.get("model_name")))
        .or_else(|| {
            value
                .get("metadata")
                .and_then(|metadata| non_empty_value_string(metadata.get("model")))
        })
}

fn non_empty_value_string(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(serde_json::Value::as_str).and_then(|text| {
        let text = text.trim();
        (!text.is_empty()).then(|| text.to_owned())
    })
}

fn codex_timestamp_from_result_value(value: &serde_json::Value) -> Option<String> {
    codex_timestamp_from_value_fields(value)
        .or_else(|| {
            value
                .get("data")
                .and_then(codex_timestamp_from_value_fields)
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(codex_timestamp_from_value_fields)
        })
        .or_else(|| {
            value
                .get("response")
                .and_then(codex_timestamp_from_value_fields)
        })
}

fn codex_timestamp_from_value_fields(value: &serde_json::Value) -> Option<String> {
    codex_timestamp_from_value(value.get("timestamp"))
        .or_else(|| codex_timestamp_from_value(value.get("created_at")))
        .or_else(|| codex_timestamp_from_value(value.get("createdAt")))
}

fn codex_timestamp_from_value(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return (!text.is_empty()).then(|| text.to_owned());
    }

    let raw = value.as_u64()?;
    let seconds = if raw > 10_000_000_000 {
        raw.checked_div(1_000)?
    } else {
        raw
    };
    format_unix_seconds_utc(seconds)
}

fn file_modified_timestamp(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| format_unix_seconds_utc(duration.as_secs()))
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_owned())
}

fn parse_codex_rate_limits(value: &serde_json::Value) -> Option<CodexRateLimits> {
    let primary = value.get("primary").and_then(parse_codex_rate_limit_window);
    let secondary = value
        .get("secondary")
        .and_then(parse_codex_rate_limit_window);

    (primary.is_some() || secondary.is_some()).then_some(CodexRateLimits { primary, secondary })
}

fn parse_codex_rate_limit_window(value: &serde_json::Value) -> Option<CodexRateLimitWindow> {
    Some(CodexRateLimitWindow {
        resets_at_unix_seconds: read_u64_field(value, "resets_at"),
        used_percent: value
            .get("used_percent")
            .and_then(serde_json::Value::as_f64),
    })
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

fn load_claude_usage() -> ClaudeUsageLoadResult {
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

        let Ok(file) = File::open(&file_path) else {
            skipped_files += 1;
            continue;
        };

        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if line.len() > MAX_JSONL_LINE_BYTES {
                continue;
            }

            let Some(entry) = parse_claude_usage_entry(&line, &file_path, projects_root) else {
                continue;
            };

            if let Some(dedupe_key) = entry.dedupe_key.as_deref() {
                if !seen_entries.insert(dedupe_key.to_owned()) {
                    continue;
                }
            }

            entries.push(entry);
        }
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

fn discover_claude_usage_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(raw_config_dirs) = env::var("CLAUDE_CONFIG_DIR") {
        for raw_config_dir in raw_config_dirs.split(',') {
            let config_dir = raw_config_dir.trim();
            if config_dir.is_empty() {
                continue;
            }

            push_existing_claude_usage_root(&mut roots, PathBuf::from(config_dir));
        }

        return roots;
    }

    let Some(home_dir) = env::var_os("HOME").map(PathBuf::from) else {
        return roots;
    };

    push_existing_claude_usage_root(&mut roots, home_dir.join(CLAUDE_XDG_CONFIG_DIR));
    push_existing_claude_usage_root(&mut roots, home_dir.join(CLAUDE_DEFAULT_CONFIG_DIR));

    roots
}

fn push_existing_claude_usage_root(roots: &mut Vec<PathBuf>, config_or_projects_dir: PathBuf) {
    let candidates = if config_or_projects_dir
        .file_name()
        .is_some_and(|name| name == "projects")
    {
        vec![config_or_projects_dir]
    } else {
        vec![
            config_or_projects_dir.join("projects"),
            config_or_projects_dir,
        ]
    };

    for candidate in candidates {
        if !candidate.is_dir() {
            continue;
        }

        let normalized = fs::canonicalize(&candidate).unwrap_or(candidate);
        if roots.iter().any(|root| root == &normalized) {
            continue;
        }

        roots.push(normalized);
    }
}

fn collect_jsonl_files(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = roots.to_vec();

    while let Some(path) = stack.pop() {
        if files.len() >= MAX_USAGE_FILE_COUNT {
            break;
        }

        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };

        if metadata.file_type().is_symlink() {
            continue;
        }

        if metadata.is_file() {
            if path
                .extension()
                .is_some_and(|extension| extension == "jsonl")
            {
                files.push(path);
            }
            continue;
        }

        let Ok(entries) = fs::read_dir(&path) else {
            continue;
        };

        for entry in entries.flatten() {
            stack.push(entry.path());
        }
    }

    files
}

fn matching_root_for_file<'a>(file_path: &Path, roots: &'a [PathBuf]) -> Option<&'a Path> {
    roots
        .iter()
        .find(|root| file_path.starts_with(root))
        .map(PathBuf::as_path)
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

fn read_claude_cache_creation_tokens(usage: &serde_json::Value) -> u64 {
    let Some(cache_creation) = usage.get("cache_creation") else {
        return 0;
    };

    read_u64_field(cache_creation, "ephemeral_5m_input_tokens")
        .unwrap_or(0)
        .saturating_add(read_u64_field(cache_creation, "ephemeral_1h_input_tokens").unwrap_or(0))
}

fn extract_iso_date(timestamp: &str) -> Option<String> {
    let date = timestamp.get(0..10)?;
    let mut chars = date.chars();
    if chars.by_ref().take(4).all(|char| char.is_ascii_digit())
        && chars.next() == Some('-')
        && chars.by_ref().take(2).all(|char| char.is_ascii_digit())
        && chars.next() == Some('-')
        && chars.all(|char| char.is_ascii_digit())
    {
        return Some(date.to_owned());
    }

    None
}

fn create_usage_dedupe_key(message_id: Option<&str>, request_id: Option<&str>) -> Option<String> {
    match (message_id, request_id) {
        (Some(message_id), Some(request_id)) => Some(format!("{message_id}|{request_id}")),
        (Some(message_id), None) => Some(message_id.to_owned()),
        (None, Some(request_id)) => Some(request_id.to_owned()),
        (None, None) => None,
    }
}

fn resolve_claude_project_path(file_path: &Path, projects_root: &Path) -> Option<String> {
    let project_dir = file_path.parent()?;
    let relative_project_dir = project_dir.strip_prefix(projects_root).ok()?;
    let value = relative_project_dir.to_string_lossy();
    (!value.is_empty()).then(|| value.to_string())
}

fn aggregate_usage_entries(entries: Vec<UsageEntry>) -> Vec<BuddyUsageRecord> {
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

fn summarize_usage_records(records: &[BuddyUsageRecord]) -> BuddyUsageTotals {
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

fn summarize_rolling_usage_window(
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

fn create_usage_windows(
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

fn parse_rfc3339_utc_seconds(timestamp: &str) -> Option<u64> {
    let year = parse_u32(timestamp.get(0..4)?)? as i32;
    let month = parse_u32(timestamp.get(5..7)?)?;
    let day = parse_u32(timestamp.get(8..10)?)?;
    let hour = parse_u32(timestamp.get(11..13)?)?;
    let minute = parse_u32(timestamp.get(14..16)?)?;
    let second = parse_u32(timestamp.get(17..19)?)?;

    if timestamp.get(4..5) != Some("-")
        || timestamp.get(7..8) != Some("-")
        || timestamp.get(10..11) != Some("T")
        || timestamp.get(13..14) != Some(":")
        || timestamp.get(16..17) != Some(":")
        || !timestamp.ends_with('Z')
        || month == 0
        || month > 12
        || day == 0
        || day > 31
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }

    let days = days_from_civil(year, month, day)?;
    u64::try_from(days)
        .ok()?
        .checked_mul(24 * 60 * 60)?
        .checked_add(u64::from(hour) * 60 * 60)?
        .checked_add(u64::from(minute) * 60)?
        .checked_add(u64::from(second))
}

fn parse_u32(value: &str) -> Option<u32> {
    value.parse::<u32>().ok()
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    let year = year - i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = i32::try_from(month).ok()?;
    let day = i32::try_from(day).ok()?;
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    Some(i64::from(era * 146097 + day_of_era - 719468))
}

fn format_unix_seconds_utc(timestamp: u64) -> Option<String> {
    let days = i64::try_from(timestamp / (24 * 60 * 60)).ok()?;
    let seconds_of_day = timestamp % (24 * 60 * 60);
    let (year, month, day) = civil_from_days(days)?;
    let hour = seconds_of_day / (60 * 60);
    let minute = (seconds_of_day % (60 * 60)) / 60;
    let second = seconds_of_day % 60;

    Some(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

fn civil_from_days(days: i64) -> Option<(i32, u32, u32)> {
    let days = days + 719468;
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let day_of_era = days - era * 146097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36524 - day_of_era / 146096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);

    Some((
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        aggregate_usage_entries, collect_jsonl_files, dedupe_codex_usage_events,
        latest_codex_rate_limits, parse_claude_usage_entry, parse_rfc3339_utc_seconds,
        read_codex_usage_file, should_reuse_usage_snapshot_cache, summarize_usage_records,
        UsageCacheFingerprint, UsageFileSignature,
    };
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

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

    #[test]
    fn collects_jsonl_files_without_following_symlinks() {
        let root = std::env::temp_dir().join(format!(
            "lexora-buddy-usage-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let project_dir = root.join("project");
        fs::create_dir_all(&project_dir).expect("create temp project");
        fs::write(project_dir.join("usage.jsonl"), "{}\n").expect("write jsonl");
        fs::write(project_dir.join("notes.txt"), "{}\n").expect("write txt");

        let files = collect_jsonl_files(&[root.clone()]);

        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].file_name().and_then(|name| name.to_str()),
            Some("usage.jsonl")
        );

        fs::remove_dir_all(root).expect("cleanup temp project");
    }

    #[test]
    fn parses_rfc3339_utc_seconds() {
        assert_eq!(parse_rfc3339_utc_seconds("1970-01-01T00:00:01Z"), Some(1));
        assert_eq!(
            parse_rfc3339_utc_seconds("1970-01-02T00:00:00.000Z"),
            Some(86_400)
        );
    }

    #[test]
    fn reuses_usage_snapshot_cache_until_files_or_time_window_change() {
        let fingerprint = UsageCacheFingerprint {
            claude_files: Vec::new(),
            claude_roots: Vec::new(),
            codex_files: vec![UsageFileSignature {
                len: 42,
                modified_subsec_nanos: 0,
                modified_unix_seconds: Some(10),
                path: PathBuf::from("/tmp/codex/session.jsonl"),
            }],
            codex_sources: vec![PathBuf::from("/tmp/codex/sessions")],
        };
        let mut changed_fingerprint = fingerprint.clone();
        changed_fingerprint.codex_files[0].modified_unix_seconds = Some(11);

        assert!(should_reuse_usage_snapshot_cache(
            &fingerprint,
            &fingerprint,
            Some(300),
            299,
        ));
        assert!(!should_reuse_usage_snapshot_cache(
            &fingerprint,
            &fingerprint,
            Some(300),
            300,
        ));
        assert!(!should_reuse_usage_snapshot_cache(
            &fingerprint,
            &changed_fingerprint,
            Some(300),
            299,
        ));
        assert!(should_reuse_usage_snapshot_cache(
            &fingerprint,
            &fingerprint,
            None,
            u64::MAX,
        ));
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
