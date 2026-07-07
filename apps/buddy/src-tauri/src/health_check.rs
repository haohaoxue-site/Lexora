use std::path::PathBuf;

use crate::{
    app_paths::{BuddyAppPaths, BuddyAppPathsStatus},
    error::BuddyResult,
    storage::{BuddyStorage, CURRENT_SCHEMA_VERSION},
};

const HEALTH_CHECK_ARG: &str = "--buddy-health-check";
const HEALTH_CHECK_DATA_DIR_ARG: &str = "--buddy-health-check-data-dir";

#[derive(Debug, PartialEq, Eq)]
pub struct BuddyHeadlessHealthCheckConfig {
    data_dir: PathBuf,
    cleanup_after: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyHeadlessHealthCheckReport {
    ok: bool,
    database_path: String,
    paths: BuddyAppPathsStatus,
    schema_version: i64,
}

pub fn run_headless_command_from_env() -> Option<BuddyResult<String>> {
    run_headless_command(std::env::args())
}

pub fn run_headless_command<I, S>(args: I) -> Option<BuddyResult<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let config = parse_headless_health_check_config(args)?;
    let cleanup_dir = config.cleanup_after.then(|| config.data_dir.clone());

    let result = create_headless_health_check_report(config.data_dir)
        .and_then(|report| Ok(serde_json::to_string(&report)?));

    if let Some(cleanup_dir) = cleanup_dir {
        let _ = std::fs::remove_dir_all(cleanup_dir);
    }

    Some(result)
}

pub fn parse_headless_health_check_config<I, S>(args: I) -> Option<BuddyHeadlessHealthCheckConfig>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_owned())
        .collect::<Vec<_>>();

    if !args.iter().any(|arg| arg == HEALTH_CHECK_ARG) {
        return None;
    }

    let explicit_data_dir = args
        .windows(2)
        .find(|window| window[0] == HEALTH_CHECK_DATA_DIR_ARG)
        .map(|window| PathBuf::from(&window[1]));
    let cleanup_after = explicit_data_dir.is_none();
    let data_dir = explicit_data_dir.unwrap_or_else(default_health_check_data_dir);

    Some(BuddyHeadlessHealthCheckConfig {
        cleanup_after,
        data_dir,
    })
}

pub fn create_headless_health_check_report(
    data_dir: PathBuf,
) -> BuddyResult<BuddyHeadlessHealthCheckReport> {
    let paths = BuddyAppPaths::from_data_dir(data_dir);
    paths.ensure_exists()?;

    let storage = BuddyStorage::new(paths.database_path());
    let status = storage.initialize()?;

    Ok(BuddyHeadlessHealthCheckReport {
        database_path: status.database_path().to_owned(),
        ok: status.schema_version() == CURRENT_SCHEMA_VERSION,
        paths: paths.status(),
        schema_version: status.schema_version(),
    })
}

fn default_health_check_data_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "lexora-buddy-health-check-{}",
        uuid::Uuid::new_v4()
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::storage::CURRENT_SCHEMA_VERSION;

    use super::run_headless_command;

    #[test]
    fn serializes_safe_health_check_summary() {
        let data_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-health-check-{}",
            uuid::Uuid::new_v4()
        ));

        let output = run_headless_command([
            "lexora-buddy",
            "--buddy-health-check",
            "--buddy-health-check-data-dir",
            data_dir.to_string_lossy().as_ref(),
        ])
        .expect("health check should handle command")
        .expect("health check should pass");

        assert!(output.contains(r#""ok":true"#));
        assert!(output.contains(&format!(r#""schemaVersion":{CURRENT_SCHEMA_VERSION}"#)));
        assert!(output.contains(r#""databasePath":"#));
        assert!(output.contains(r#""conversationsDir":"#));
        assert!(output.contains(r#""runsDir":"#));
        assert!(output.contains(r#""memoriesDir":"#));
        assert!(output.contains(r#""sqliteDir":"#));
        assert!(!output.contains("pairing"));
        assert!(!output.contains("token"));
    }

    #[test]
    fn cleans_default_temporary_health_check_directory() {
        let output = run_headless_command(["lexora-buddy", "--buddy-health-check"])
            .expect("health check should handle command")
            .expect("health check should pass");
        let value: serde_json::Value = serde_json::from_str(&output).expect("parse output");
        let database_path = value
            .get("databasePath")
            .and_then(serde_json::Value::as_str)
            .expect("database path");
        let data_dir = std::path::Path::new(database_path)
            .parent()
            .expect("data dir");

        assert!(fs::metadata(data_dir).is_err());
    }
}
