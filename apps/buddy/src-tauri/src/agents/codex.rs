use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use crate::{
    agents::redaction::sanitize_process_stderr_line,
    agents::subprocess_env::{apply_agent_subprocess_env, apply_agent_subprocess_env_from},
    error::{BuddyError, BuddyResult},
};

pub struct CodexExecOutput {
    pub final_message: String,
    pub stdout: String,
}

#[derive(Debug)]
pub struct CodexAppServerOutput {
    pub final_message: String,
    pub final_memory_citation: Option<serde_json::Value>,
    pub thread_id: String,
    pub turn_id: Option<String>,
}

pub struct CodexAppServerProjectedEvent {
    pub event_type: &'static str,
    pub payload: serde_json::Value,
}

const CODEX_EXEC_STDERR_CHAR_LIMIT: usize = 2_000;

mod app_server;

pub use app_server::{
    check_codex_app_server_smoke, load_codex_model_options, load_codex_prompt_context_options,
    run_codex_app_server_turn_with_cancellation_and_approval_handler,
    CodexAppServerApprovalDecision, CodexAppServerApprovalRequest,
};

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelSelection {
    pub model: Option<String>,
    pub service_tier: Option<String>,
    pub effort: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelOption {
    pub runtime: &'static str,
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub default_reasoning_effort: Option<String>,
    pub supported_reasoning_efforts: Vec<CodexReasoningEffortOption>,
    pub service_tiers: Vec<CodexModelServiceTier>,
    pub default_service_tier: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexReasoningEffortOption {
    pub reasoning_effort: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelServiceTier {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(tag = "type")]
pub enum CodexUserInput {
    #[serde(rename = "text")]
    Text {
        text: String,
        #[serde(default, rename = "text_elements")]
        text_elements: Vec<CodexTextElement>,
    },
    #[serde(rename = "image")]
    Image {
        #[serde(default)]
        detail: Option<String>,
        url: String,
    },
    #[serde(rename = "localImage")]
    LocalImage {
        #[serde(default)]
        detail: Option<String>,
        path: String,
    },
    #[serde(rename = "skill")]
    Skill { name: String, path: String },
    #[serde(rename = "mention")]
    Mention { name: String, path: String },
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTextElement {
    pub byte_range: CodexByteRange,
    pub placeholder: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct CodexByteRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptContextOptions {
    pub files: Vec<CodexPromptContextOption>,
    pub plugins: Vec<CodexPromptContextOption>,
    pub skills: Vec<CodexPromptContextOption>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptContextOption {
    pub description: Option<String>,
    pub kind: &'static str,
    pub label: String,
    pub path: Option<String>,
    pub value: String,
}

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
    let version_output = run_codex_probe(["--version"]);
    let login_status_output = if version_output.is_some() {
        run_codex_output_probe(["login", "status"])
    } else {
        None
    };
    let app_server_available = run_codex_probe(["app-server", "--help"]).is_some();
    let exec_json_available =
        run_codex_probe(["exec", "--help"]).is_some_and(|output| output.contains("--json"));

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
            resolve_codex_login_status(login_status_output.as_deref())
        } else {
            "unavailable"
        },
        preferred_protocol: "codex_app_server",
        version: version_output
            .as_deref()
            .and_then(extract_codex_cli_version),
    }
}

pub fn build_codex_exec_args(output_path: &Path, cwd: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "exec".to_owned(),
        "--json".to_owned(),
        "--ephemeral".to_owned(),
        "--sandbox".to_owned(),
        "read-only".to_owned(),
        "--ask-for-approval".to_owned(),
        "never".to_owned(),
        "--skip-git-repo-check".to_owned(),
        "--output-last-message".to_owned(),
        output_path.to_string_lossy().into_owned(),
    ];

    if let Some(cwd) = cwd {
        args.push("--cd".to_owned());
        args.push(cwd.to_owned());
    }

    args.push("-".to_owned());
    args
}

pub fn run_codex_exec_with_cancellation(
    prompt: &str,
    output_path: &Path,
    cwd: Option<&str>,
    cancellation: Option<Arc<AtomicBool>>,
) -> BuddyResult<CodexExecOutput> {
    let mut command = Command::new("codex");
    command
        .args(build_codex_exec_args(output_path, cwd))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_agent_subprocess_env(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| BuddyError::Codex(format!("failed to start codex: {error}")))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| BuddyError::Codex("failed to open codex stdin".to_owned()))?;
    stdin.write_all(prompt.as_bytes())?;
    drop(stdin);

    if let Some(cancellation) = &cancellation {
        loop {
            if cancellation.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err(BuddyError::Codex("codex exec cancelled".to_owned()));
            }

            if child
                .try_wait()
                .map_err(|error| BuddyError::Codex(format!("failed to wait for codex: {error}")))?
                .is_some()
            {
                break;
            }

            thread::sleep(Duration::from_millis(50));
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| BuddyError::Codex(format!("failed to wait for codex: {error}")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        let stderr = sanitize_codex_exec_stderr_for_error(&stderr);
        return Err(BuddyError::Codex(format!(
            "codex exec exited with status {}: {}",
            output.status, stderr
        )));
    }

    let final_message = std::fs::read_to_string(output_path)
        .map_err(|error| BuddyError::Codex(format!("failed to read codex final message: {error}")))?
        .trim()
        .to_owned();

    Ok(CodexExecOutput {
        final_message,
        stdout,
    })
}

pub fn create_codex_output_path(run_id: &str) -> PathBuf {
    std::env::temp_dir().join(format!("lexora-buddy-codex-{run_id}.txt"))
}

fn sanitize_codex_exec_stderr_for_error(stderr: &str) -> String {
    let mut sanitized = stderr
        .lines()
        .map(sanitize_process_stderr_line)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned();
    if sanitized.chars().count() > CODEX_EXEC_STDERR_CHAR_LIMIT {
        sanitized = sanitized
            .chars()
            .take(CODEX_EXEC_STDERR_CHAR_LIMIT)
            .collect::<String>();
        sanitized.push_str("...");
    }

    sanitized
}

fn run_codex_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    run_codex_probe_with_program_and_env(Path::new("codex"), args, std::env::vars())
}

fn run_codex_probe_with_program_and_env<const N: usize>(
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

    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run_codex_output_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    run_codex_output_probe_with_program_and_env(Path::new("codex"), args, std::env::vars())
}

fn run_codex_output_probe_with_program_and_env<const N: usize>(
    program: &Path,
    args: [&str; N],
    env_source: impl IntoIterator<Item = (String, String)>,
) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    apply_agent_subprocess_env_from(&mut command, env_source);
    let output = command.output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Some(format!("{stdout}{stderr}").trim().to_owned())
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
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn builds_ephemeral_read_only_codex_exec_args() {
        let args = build_codex_exec_args(&PathBuf::from("/tmp/answer.txt"), Some("/tmp/project"));

        assert_eq!(args[0], "exec");
        assert!(args.contains(&"--json".to_owned()));
        assert!(args.contains(&"--ephemeral".to_owned()));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--sandbox", "read-only"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--ask-for-approval", "never"]));
        assert!(args.windows(2).any(|pair| pair == ["--cd", "/tmp/project"]));
        assert_eq!(args.last().map(String::as_str), Some("-"));
    }

    #[test]
    fn resolves_codex_login_status() {
        assert_eq!(
            resolve_codex_login_status(Some(r#"{"loggedIn":true}"#)),
            "logged_in"
        );
        assert_eq!(
            resolve_codex_login_status(Some("Not logged in. Run codex login.")),
            "logged_out"
        );
        assert_eq!(resolve_codex_login_status(Some("")), "unknown");
    }

    #[test]
    fn redacts_codex_exec_stderr_before_error_reporting() {
        let message = sanitize_codex_exec_stderr_for_error(
            "auth failed: OPENAI_API_KEY=sk-test-secret\nAuthorization: Bearer live-token",
        );

        assert!(message.contains("OPENAI_API_KEY=[redacted]"));
        assert!(message.contains("Authorization: Bearer [redacted]"));
        assert!(!message.contains("sk-test-secret"));
        assert!(!message.contains("live-token"));
    }

    #[test]
    #[cfg(unix)]
    fn codex_probe_passes_only_agent_subprocess_env_to_child() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-probe-env-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex");
        let script = r#"#!/bin/sh
printf '%s\n' "OPENAI_API_KEY=${OPENAI_API_KEY-unset}"
printf '%s\n' "GITHUB_PAT_TOKEN=${GITHUB_PAT_TOKEN-unset}"
printf '%s\n' "GITHUB_TOKEN=${GITHUB_TOKEN-unset}"
printf '%s\n' "NODE_OPTIONS=${NODE_OPTIONS-unset}"
"#;
        fs::write(&script_path, script).expect("write fake codex");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake codex executable");

        let output = run_codex_probe_with_program_and_env(
            &script_path,
            ["--version"],
            vec![
                ("OPENAI_API_KEY".to_owned(), "sk-provider".to_owned()),
                ("GITHUB_PAT_TOKEN".to_owned(), "github-pat".to_owned()),
                ("GITHUB_TOKEN".to_owned(), "ghp-secret".to_owned()),
                (
                    "NODE_OPTIONS".to_owned(),
                    "--require /tmp/hook.js".to_owned(),
                ),
            ],
        )
        .expect("probe output");

        assert!(output.contains("OPENAI_API_KEY=sk-provider"));
        assert!(output.contains("GITHUB_PAT_TOKEN=github-pat"));
        assert!(output.contains("GITHUB_TOKEN=unset"));
        assert!(output.contains("NODE_OPTIONS=unset"));

        let _ = fs::remove_dir_all(temp_dir);
    }
}
