use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::Connection;

use crate::{app_paths::SQLITE_DIR_NAME, error::BuddyResult};

const STORAGE_BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);
#[cfg(not(test))]
const SLOW_STORAGE_OPERATION_THRESHOLD: Duration = Duration::from_millis(250);

pub(super) fn infer_buddy_home_from_database_path(database_path: &Path) -> PathBuf {
    let Some(parent) = database_path.parent() else {
        return PathBuf::from(".");
    };
    if parent
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value == SQLITE_DIR_NAME)
    {
        return parent
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| parent.to_path_buf());
    }

    parent.to_path_buf()
}

pub(super) fn configure_connection(connection: &Connection) -> BuddyResult<()> {
    connection.busy_timeout(STORAGE_BUSY_TIMEOUT)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;

    Ok(())
}

pub(super) fn configure_database_file(connection: &Connection) -> BuddyResult<()> {
    connection.pragma_update(None, "journal_mode", "WAL")?;

    Ok(())
}

#[cfg(not(test))]
pub(super) fn log_slow_storage_operation(operation: &str, elapsed: Duration) {
    if elapsed < SLOW_STORAGE_OPERATION_THRESHOLD {
        return;
    }

    eprintln!(
        "lexora buddy storage operation is slow: {operation} took {}ms",
        elapsed.as_millis()
    );
}

#[cfg(test)]
pub(super) fn log_slow_storage_operation(_operation: &str, _elapsed: Duration) {}

pub(super) fn remove_sqlite_file_family(database_path: &Path) -> BuddyResult<()> {
    for path in [
        database_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", database_path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", database_path.to_string_lossy())),
    ] {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }

    Ok(())
}
