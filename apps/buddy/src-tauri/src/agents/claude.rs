use std::{path::Path, process::Command};

use crate::agents::subprocess_env::apply_agent_subprocess_env_from;

#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeRuntimeStatus {
    pub cli_available: bool,
    pub version: Option<String>,
    pub login_status: &'static str,
    pub auth_method: Option<String>,
    pub api_provider: Option<String>,
    pub print_mode_available: bool,
    pub stream_json_available: bool,
    pub memory_isolation_available: bool,
    pub preferred_protocol: &'static str,
    pub active_protocol: &'static str,
    pub execution_enabled: bool,
}

pub fn detect_claude_runtime_status() -> ClaudeRuntimeStatus {
    let version_output = run_claude_success_probe(["--version"]);
    let help_output = run_claude_success_probe(["--help"]);
    let auth_status_output = if version_output.is_some() || help_output.is_some() {
        run_claude_output_probe(["auth", "status"])
    } else {
        None
    };

    resolve_claude_runtime_status(
        version_output.as_deref(),
        help_output.as_deref(),
        auth_status_output.as_deref(),
    )
}

fn resolve_claude_runtime_status(
    version_output: Option<&str>,
    help_output: Option<&str>,
    auth_status_output: Option<&str>,
) -> ClaudeRuntimeStatus {
    let cli_available = version_output.is_some() || help_output.is_some();
    let help_output = help_output.unwrap_or_default();
    let print_mode_available = help_output.contains("--print") || help_output.contains("-p,");
    let stream_json_available =
        help_output.contains("stream-json") && help_output.contains("--output-format");
    let memory_isolation_available =
        help_output.contains("--no-session-persistence") && help_output.contains("--bare");
    let auth_status = if cli_available {
        resolve_claude_auth_status(auth_status_output)
    } else {
        ClaudeAuthStatus {
            api_provider: None,
            auth_method: None,
            login_status: "unavailable",
        }
    };

    ClaudeRuntimeStatus {
        active_protocol: if cli_available && print_mode_available && stream_json_available {
            "status_only"
        } else {
            "unavailable"
        },
        api_provider: auth_status.api_provider,
        auth_method: auth_status.auth_method,
        cli_available,
        execution_enabled: false,
        login_status: auth_status.login_status,
        memory_isolation_available,
        preferred_protocol: "claude_print_stream_json",
        print_mode_available,
        stream_json_available,
        version: version_output
            .and_then(extract_claude_cli_version)
            .map(str::to_owned),
    }
}

struct ClaudeAuthStatus {
    login_status: &'static str,
    auth_method: Option<String>,
    api_provider: Option<String>,
}

fn resolve_claude_auth_status(auth_status_output: Option<&str>) -> ClaudeAuthStatus {
    let Some(output) = auth_status_output
        .map(str::trim)
        .filter(|output| !output.is_empty())
    else {
        return ClaudeAuthStatus {
            api_provider: None,
            auth_method: None,
            login_status: "unknown",
        };
    };

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(output) {
        return resolve_claude_json_auth_status(&value);
    }

    let normalized = output.to_lowercase();
    let compact: String = normalized
        .chars()
        .filter(|char| !char.is_whitespace())
        .collect();
    if compact.contains("\"loggedin\":true") && compact.contains("\"apiprovider\":\"firstparty\"") {
        return ClaudeAuthStatus {
            api_provider: Some("firstParty".to_owned()),
            auth_method: extract_compact_json_string_value(&compact, "authmethod"),
            login_status: "logged_in",
        };
    }

    if compact.contains("\"loggedin\":true") {
        return ClaudeAuthStatus {
            api_provider: extract_compact_json_string_value(&compact, "apiprovider"),
            auth_method: extract_compact_json_string_value(&compact, "authmethod"),
            login_status: "logged_out",
        };
    }

    if compact.contains("\"loggedin\":false") {
        return ClaudeAuthStatus {
            api_provider: extract_compact_json_string_value(&compact, "apiprovider"),
            auth_method: extract_compact_json_string_value(&compact, "authmethod"),
            login_status: "logged_out",
        };
    }

    if normalized.contains("not logged in") || normalized.contains("logged out") {
        return ClaudeAuthStatus {
            api_provider: None,
            auth_method: None,
            login_status: "logged_out",
        };
    }

    if normalized.contains("logged in") {
        return ClaudeAuthStatus {
            api_provider: None,
            auth_method: None,
            login_status: "unknown",
        };
    }

    ClaudeAuthStatus {
        api_provider: None,
        auth_method: None,
        login_status: "unknown",
    }
}

fn resolve_claude_json_auth_status(value: &serde_json::Value) -> ClaudeAuthStatus {
    let api_provider = value
        .get("apiProvider")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let auth_method = value
        .get("authMethod")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let login_status = match value.get("loggedIn").and_then(serde_json::Value::as_bool) {
        Some(true) if api_provider.as_deref() == Some("firstParty") => "logged_in",
        Some(true) | Some(false) => "logged_out",
        None => "unknown",
    };

    ClaudeAuthStatus {
        api_provider,
        auth_method,
        login_status,
    }
}

fn extract_compact_json_string_value(compact: &str, key: &str) -> Option<String> {
    let marker = format!("\"{key}\":\"");
    let value_start = compact.find(&marker)? + marker.len();
    let value_end = compact[value_start..].find('"')? + value_start;

    Some(compact[value_start..value_end].to_owned())
}

fn extract_claude_cli_version(output: &str) -> Option<&str> {
    output.split_whitespace().find(|part| {
        part.chars()
            .next()
            .is_some_and(|char| char.is_ascii_digit())
    })
}

fn run_claude_success_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    run_claude_success_probe_with_program_and_env(Path::new("claude"), args, std::env::vars())
}

fn run_claude_success_probe_with_program_and_env<const N: usize>(
    program: &Path,
    args: [&str; N],
    env_source: impl IntoIterator<Item = (String, String)>,
) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    apply_agent_subprocess_env_from(&mut command, env_source);
    let output = command.output().ok()?;

    if !output.status.success() {
        return None;
    }

    Some(format_command_output(output.stdout, output.stderr))
}

fn run_claude_output_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    let mut command = Command::new("claude");
    command.args(args);
    apply_agent_subprocess_env_from(&mut command, std::env::vars());
    let output = command.output().ok()?;

    Some(format_command_output(output.stdout, output.stderr))
}

fn format_command_output(stdout: Vec<u8>, stderr: Vec<u8>) -> String {
    let stdout = String::from_utf8_lossy(&stdout);
    let stderr = String::from_utf8_lossy(&stderr);

    format!("{stdout}{stderr}").trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::{resolve_claude_runtime_status, run_claude_success_probe_with_program_and_env};

    #[test]
    fn resolves_logged_in_status_only_runtime() {
        let status = resolve_claude_runtime_status(
            Some("2.1.168 (Claude Code)"),
            Some(
                "Usage: claude [options]\n  -p, --print\n  --output-format <format> text, json, stream-json\n  --no-session-persistence\n  --bare\n",
            ),
            Some(r#"{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}"#),
        );

        assert!(status.cli_available);
        assert_eq!(status.version.as_deref(), Some("2.1.168"));
        assert_eq!(status.login_status, "logged_in");
        assert_eq!(status.auth_method.as_deref(), Some("oauth_token"));
        assert_eq!(status.api_provider.as_deref(), Some("firstParty"));
        assert!(status.print_mode_available);
        assert!(status.stream_json_available);
        assert!(status.memory_isolation_available);
        assert_eq!(status.preferred_protocol, "claude_print_stream_json");
        assert_eq!(status.active_protocol, "status_only");
        assert!(!status.execution_enabled);
    }

    #[test]
    fn resolves_unavailable_when_cli_is_missing() {
        let status = resolve_claude_runtime_status(None, None, None);

        assert!(!status.cli_available);
        assert_eq!(status.login_status, "unavailable");
        assert_eq!(status.auth_method, None);
        assert_eq!(status.api_provider, None);
        assert_eq!(status.active_protocol, "unavailable");
        assert!(!status.execution_enabled);
    }

    #[test]
    fn resolves_auth_json_even_with_extra_output() {
        let status = resolve_claude_runtime_status(
            Some("2.1.168 (Claude Code)"),
            Some("-p, --print\n--output-format stream-json"),
            Some(r#"{"loggedIn":false}warning: stale cache"#),
        );

        assert_eq!(status.login_status, "logged_out");
    }

    #[test]
    fn treats_third_party_api_as_not_account_login() {
        let status = resolve_claude_runtime_status(
            Some("2.1.168 (Claude Code)"),
            Some("-p, --print\n--output-format stream-json"),
            Some(r#"{"loggedIn":true,"authMethod":"api_key","apiProvider":"thirdParty"}"#),
        );

        assert_eq!(status.login_status, "logged_out");
        assert_eq!(status.auth_method.as_deref(), Some("api_key"));
        assert_eq!(status.api_provider.as_deref(), Some("thirdParty"));
    }

    #[test]
    #[cfg(unix)]
    fn claude_probe_passes_only_agent_subprocess_env_to_child() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-claude-probe-env-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("claude");
        let script = r#"#!/bin/sh
printf '%s\n' "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY-unset}"
printf '%s\n' "GITHUB_TOKEN=${GITHUB_TOKEN-unset}"
printf '%s\n' "NODE_OPTIONS=${NODE_OPTIONS-unset}"
"#;
        fs::write(&script_path, script).expect("write fake claude");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake claude executable");

        let output = run_claude_success_probe_with_program_and_env(
            &script_path,
            ["--version"],
            vec![
                ("ANTHROPIC_API_KEY".to_owned(), "sk-ant".to_owned()),
                ("GITHUB_TOKEN".to_owned(), "ghp-secret".to_owned()),
                (
                    "NODE_OPTIONS".to_owned(),
                    "--require /tmp/hook.js".to_owned(),
                ),
            ],
        )
        .expect("probe output");

        assert!(output.contains("ANTHROPIC_API_KEY=sk-ant"));
        assert!(output.contains("GITHUB_TOKEN=unset"));
        assert!(output.contains("NODE_OPTIONS=unset"));

        let _ = fs::remove_dir_all(temp_dir);
    }
}
