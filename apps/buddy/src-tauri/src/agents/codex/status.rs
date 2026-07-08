use super::probe::{run_codex_output_probe, run_codex_success_probe};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeStatus {
    pub cli_available: bool,
    pub version: Option<String>,
    pub login_status: &'static str,
    pub app_server_available: bool,
    pub exec_json_available: bool,
    pub preferred_protocol: &'static str,
    pub active_protocol: &'static str,
}

pub fn detect_codex_runtime_status() -> CodexRuntimeStatus {
    let version_output = run_codex_success_probe(["--version"]);
    let login_status_output = if version_output.is_some() {
        run_codex_output_probe(["login", "status"])
    } else {
        None
    };
    let app_server_help_output = run_codex_success_probe(["app-server", "--help"]);
    let exec_help_output = run_codex_success_probe(["exec", "--help"]);

    resolve_codex_runtime_status(
        version_output.as_deref(),
        login_status_output.as_deref(),
        app_server_help_output.as_deref(),
        exec_help_output.as_deref(),
    )
}

fn resolve_codex_runtime_status(
    version_output: Option<&str>,
    login_status_output: Option<&str>,
    app_server_help_output: Option<&str>,
    exec_help_output: Option<&str>,
) -> CodexRuntimeStatus {
    let app_server_available = app_server_help_output.is_some();
    let exec_json_available = exec_help_output.is_some_and(|output| output.contains("--json"));

    CodexRuntimeStatus {
        active_protocol: if app_server_available {
            "codex_app_server"
        } else if exec_json_available {
            "codex_exec_json_fallback"
        } else {
            "unavailable"
        },
        app_server_available,
        cli_available: version_output.is_some(),
        exec_json_available,
        login_status: if version_output.is_some() {
            resolve_codex_login_status(login_status_output)
        } else {
            "unavailable"
        },
        preferred_protocol: "codex_app_server",
        version: version_output.and_then(extract_codex_cli_version),
    }
}

fn resolve_codex_login_status(status_output: Option<&str>) -> &'static str {
    let Some(output) = status_output
        .map(str::trim)
        .filter(|output| !output.is_empty())
    else {
        return "unknown";
    };

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(output) {
        if value
            .get("loggedIn")
            .and_then(serde_json::Value::as_bool)
            .is_some_and(|logged_in| logged_in)
        {
            return "logged_in";
        }

        if value
            .get("loggedIn")
            .and_then(serde_json::Value::as_bool)
            .is_some_and(|logged_in| !logged_in)
        {
            return "logged_out";
        }
    }

    let normalized = output.to_lowercase();
    let compact: String = normalized
        .chars()
        .filter(|char| !char.is_whitespace())
        .collect();
    if compact.contains("\"loggedin\":true") {
        return "logged_in";
    }

    if compact.contains("\"loggedin\":false") {
        return "logged_out";
    }

    if normalized.contains("not logged in")
        || normalized.contains("logged out")
        || normalized.contains("no login")
    {
        return "logged_out";
    }

    if normalized.contains("logged in") || normalized.contains("authenticated") {
        return "logged_in";
    }

    "unknown"
}

fn extract_codex_cli_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|part| {
            part.chars()
                .next()
                .is_some_and(|char| char.is_ascii_digit())
        })
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_codex_app_server_runtime_status_when_app_server_probe_succeeds() {
        let status = resolve_codex_runtime_status(
            Some("codex-cli 9.9.9"),
            Some(r#"{"loggedIn":true}"#),
            Some("Usage: codex app-server"),
            Some("Usage: codex exec --json"),
        );

        assert!(status.cli_available);
        assert_eq!(status.version.as_deref(), Some("9.9.9"));
        assert_eq!(status.login_status, "logged_in");
        assert!(status.app_server_available);
        assert!(status.exec_json_available);
        assert_eq!(status.preferred_protocol, "codex_app_server");
        assert_eq!(status.active_protocol, "codex_app_server");
    }

    #[test]
    fn resolves_codex_exec_json_fallback_when_app_server_probe_fails() {
        let status = resolve_codex_runtime_status(
            Some("codex-cli 9.9.9"),
            Some("Not logged in. Run codex login."),
            None,
            Some("Usage: codex exec --json"),
        );

        assert_eq!(status.login_status, "logged_out");
        assert!(!status.app_server_available);
        assert!(status.exec_json_available);
        assert_eq!(status.active_protocol, "codex_exec_json_fallback");
    }

    #[test]
    fn resolves_codex_unavailable_status_when_cli_probe_fails() {
        let status = resolve_codex_runtime_status(None, Some(r#"{"loggedIn":true}"#), None, None);

        assert!(!status.cli_available);
        assert_eq!(status.version, None);
        assert_eq!(status.login_status, "unavailable");
        assert_eq!(status.active_protocol, "unavailable");
    }

    #[test]
    fn resolves_codex_login_status_from_json_output() {
        assert_eq!(
            resolve_codex_login_status(Some(r#"{"loggedIn":true}"#)),
            "logged_in"
        );
    }

    #[test]
    fn resolves_codex_login_status_from_text_output() {
        assert_eq!(
            resolve_codex_login_status(Some("Not logged in. Run codex login.")),
            "logged_out"
        );
    }

    #[test]
    fn resolves_unknown_codex_login_status_from_empty_output() {
        assert_eq!(resolve_codex_login_status(Some("")), "unknown");
    }
}
