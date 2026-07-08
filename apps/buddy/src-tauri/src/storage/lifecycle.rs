use std::{path::PathBuf, time::Instant};

use rusqlite::Connection;

use crate::{error::BuddyResult, local_log::LocalLogRuntime};

use super::{
    connection::{
        configure_connection, configure_database_file, infer_buddy_home_from_database_path,
        log_slow_storage_operation, remove_sqlite_file_family,
    },
    reconcile,
    schema::{apply_current_schema, read_schema_version, CURRENT_SCHEMA_VERSION},
    BuddyStorage,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyStorageStatus {
    database_path: String,
    schema_version: i64,
}

impl BuddyStorageStatus {
    pub fn database_path(&self) -> &str {
        &self.database_path
    }

    pub fn schema_version(&self) -> i64 {
        self.schema_version
    }
}

impl BuddyStorage {
    pub fn new(database_path: PathBuf) -> Self {
        let buddy_home = infer_buddy_home_from_database_path(&database_path);

        Self::new_with_buddy_home(database_path, buddy_home)
    }

    pub fn new_with_buddy_home(database_path: PathBuf, buddy_home: PathBuf) -> Self {
        Self {
            database_path,
            local_logs: LocalLogRuntime::new(buddy_home),
        }
    }

    #[cfg(test)]
    pub fn new_temporary_for_test() -> BuddyResult<Self> {
        let buddy_home =
            std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let database_path = buddy_home.join("sqlite").join("state.sqlite3");
        let storage = Self::new_fixed_for_test(database_path, buddy_home);
        storage.initialize()?;

        Ok(storage)
    }

    #[cfg(test)]
    pub(super) fn new_fixed_for_test(database_path: PathBuf, buddy_home: PathBuf) -> Self {
        Self {
            database_path,
            local_logs: LocalLogRuntime::fixed_for_test(
                buddy_home,
                crate::local_log::LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7),
            ),
        }
    }

    #[cfg(test)]
    pub fn read_local_log_lines_for_test(&self, relative_path: &str) -> Vec<String> {
        let path = self.local_logs.absolute_path_for_test(relative_path);
        let content = std::fs::read_to_string(path).expect("read local log");

        content.lines().map(str::to_owned).collect()
    }

    pub fn initialize(&self) -> BuddyResult<BuddyStorageStatus> {
        let started_at = Instant::now();
        if let Some(parent) = self.database_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        self.reset_stale_database_file()?;
        let mut connection = self.open_connection()?;
        configure_database_file(&connection)?;
        apply_current_schema(&connection)?;
        self.reconcile_discovered_local_logs(&mut connection)?;
        let status = self.status(&connection)?;
        log_slow_storage_operation("initialize", started_at.elapsed());

        Ok(status)
    }

    pub fn status_snapshot(&self) -> BuddyResult<BuddyStorageStatus> {
        self.with_connection("storage_status_snapshot", |connection| {
            self.status(connection)
        })
    }

    pub(super) fn open_connection(&self) -> BuddyResult<Connection> {
        let started_at = Instant::now();
        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        log_slow_storage_operation("open_connection", started_at.elapsed());

        Ok(connection)
    }

    fn reset_stale_database_file(&self) -> BuddyResult<()> {
        if !self.database_path.exists() {
            return Ok(());
        }

        let connection = Connection::open(&self.database_path)?;
        configure_connection(&connection)?;
        let schema_version = read_schema_version(&connection)?;
        drop(connection);

        if schema_version == CURRENT_SCHEMA_VERSION {
            return Ok(());
        }

        remove_sqlite_file_family(&self.database_path)
    }

    pub(super) fn with_connection<T>(
        &self,
        operation: &'static str,
        run: impl FnOnce(&Connection) -> BuddyResult<T>,
    ) -> BuddyResult<T> {
        let started_at = Instant::now();
        let connection = self.open_connection()?;
        let result = run(&connection);
        log_slow_storage_operation(operation, started_at.elapsed());

        result
    }

    pub(super) fn with_mut_connection<T>(
        &self,
        operation: &'static str,
        run: impl FnOnce(&mut Connection) -> BuddyResult<T>,
    ) -> BuddyResult<T> {
        let started_at = Instant::now();
        let mut connection = self.open_connection()?;
        let result = run(&mut connection);
        log_slow_storage_operation(operation, started_at.elapsed());

        result
    }

    fn reconcile_discovered_local_logs(&self, connection: &mut Connection) -> BuddyResult<()> {
        let conversation_logs = self.local_logs.discover_conversation_logs()?;
        let run_logs = self.local_logs.discover_run_logs()?;
        if conversation_logs.is_empty() && run_logs.is_empty() {
            return Ok(());
        }

        let transaction = connection.transaction()?;
        for log_path in conversation_logs {
            let absolute_log_path = self.local_logs.checked_absolute_path(&log_path)?;
            reconcile::reconcile_conversation_log(&transaction, &log_path, &absolute_log_path)?;
        }
        for log_path in run_logs {
            let absolute_log_path = self.local_logs.checked_absolute_path(&log_path)?;
            reconcile::reconcile_run_log(&transaction, &log_path, &absolute_log_path)?;
        }
        transaction.commit()?;

        Ok(())
    }

    fn status(&self, connection: &Connection) -> BuddyResult<BuddyStorageStatus> {
        Ok(BuddyStorageStatus {
            database_path: self.database_path.to_string_lossy().into_owned(),
            schema_version: read_schema_version(connection)?,
        })
    }
}
