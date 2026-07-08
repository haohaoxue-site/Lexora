use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};

use super::{
    claude::discover_claude_usage_roots,
    codex::{collect_deduped_codex_usage_files, discover_codex_usage_sources},
    files::collect_jsonl_files,
    time::parse_rfc3339_utc_seconds,
    BuddyUsageSnapshot, MAX_USAGE_FILE_COUNT,
};

static USAGE_SNAPSHOT_CACHE: OnceLock<Mutex<Option<UsageSnapshotCacheEntry>>> = OnceLock::new();

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct UsageCacheFingerprint {
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

pub(super) fn collect_usage_cache_fingerprint() -> UsageCacheFingerprint {
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

pub(super) fn read_cached_usage_snapshot(
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

pub(super) fn write_cached_usage_snapshot(
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
