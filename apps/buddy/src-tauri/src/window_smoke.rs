use std::path::PathBuf;

const WINDOW_SMOKE_CHECK_ARG: &str = "--buddy-window-smoke-check";
const WINDOW_SMOKE_CHECK_DATA_DIR_ARG: &str = "--buddy-window-smoke-check-data-dir";

#[derive(Debug, PartialEq, Eq)]
pub struct BuddyWindowSmokeCheckConfig {
    pub(crate) cleanup_after: bool,
    pub(crate) data_dir: PathBuf,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyWindowSmokeCheckReport {
    pub(crate) ok: bool,
    pub(crate) window_label: String,
    pub(crate) state_initialized: bool,
}

pub fn parse_window_smoke_check_config<I, S>(args: I) -> Option<BuddyWindowSmokeCheckConfig>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_owned())
        .collect::<Vec<_>>();

    if !args.iter().any(|arg| arg == WINDOW_SMOKE_CHECK_ARG) {
        return None;
    }

    let explicit_data_dir = args
        .windows(2)
        .find(|window| window[0] == WINDOW_SMOKE_CHECK_DATA_DIR_ARG)
        .map(|window| PathBuf::from(&window[1]));
    let cleanup_after = explicit_data_dir.is_none();
    let data_dir = explicit_data_dir.unwrap_or_else(default_window_smoke_check_data_dir);

    Some(BuddyWindowSmokeCheckConfig {
        cleanup_after,
        data_dir,
    })
}

pub fn create_window_smoke_check_report(
    window_label: impl Into<String>,
    state_initialized: bool,
) -> BuddyWindowSmokeCheckReport {
    BuddyWindowSmokeCheckReport {
        ok: state_initialized,
        window_label: window_label.into(),
        state_initialized,
    }
}

pub fn default_window_smoke_check_data_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "lexora-buddy-window-smoke-{}",
        uuid::Uuid::new_v4()
    ))
}

#[cfg(test)]
mod tests {
    use super::create_window_smoke_check_report;
    #[test]
    fn serializes_safe_window_smoke_summary() {
        let report = create_window_smoke_check_report("main", true);
        let output = serde_json::to_string(&report).expect("serialize report");

        assert!(output.contains(r#""ok":true"#));
        assert!(output.contains(r#""windowLabel":"main""#));
        assert!(output.contains(r#""stateInitialized":true"#));
        assert!(!output.contains("pairing"));
        assert!(!output.contains("token"));
    }
}
