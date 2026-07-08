use std::{collections::HashSet, env, fs, path::PathBuf};

mod parser;
mod rate_limits;
mod raw_usage;
mod value;

use parser::{dedupe_codex_usage_events, latest_codex_rate_limits, read_codex_usage_file};

use super::{
    files::collect_jsonl_files, summary::aggregate_usage_entries, BuddyUsageRecord,
    BuddyUsageSourceSnapshot, MAX_USAGE_FILE_COUNT,
};

const CODEX_DEFAULT_HOME_DIR: &str = ".codex";

#[derive(Clone, Debug)]
pub(super) struct CodexUsageLoadResult {
    pub(super) source: BuddyUsageSourceSnapshot,
    pub(super) records: Vec<BuddyUsageRecord>,
    pub(super) latest_rate_limits: Option<CodexRateLimits>,
}

#[derive(Clone, Debug)]
pub(super) struct CodexUsageSource {
    pub(super) dir: PathBuf,
    pub(super) dedupe_scope: PathBuf,
}

#[derive(Clone, Debug)]
pub(super) struct CodexRateLimits {
    pub(super) primary: Option<CodexRateLimitWindow>,
    pub(super) secondary: Option<CodexRateLimitWindow>,
}

#[derive(Clone, Debug)]
pub(super) struct CodexRateLimitWindow {
    pub(super) used_percent: Option<f64>,
    pub(super) resets_at_unix_seconds: Option<u64>,
}

pub(super) fn load_codex_usage() -> CodexUsageLoadResult {
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

pub(super) fn discover_codex_usage_sources() -> Vec<CodexUsageSource> {
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

pub(super) fn collect_deduped_codex_usage_files(
    sources: &[CodexUsageSource],
) -> Vec<(PathBuf, PathBuf)> {
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
