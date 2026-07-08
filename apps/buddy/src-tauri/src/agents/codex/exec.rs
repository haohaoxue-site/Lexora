use std::{
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use crate::{
    agents::{
        redaction::sanitize_process_stderr_line, subprocess_env::create_agent_subprocess_command,
    },
    error::{BuddyError, BuddyResult},
};

pub(crate) struct CodexExecOutput {
    pub final_message: String,
    pub stdout: String,
}

const CODEX_EXEC_STDERR_CHAR_LIMIT: usize = 2_000;

fn build_codex_exec_args(output_path: &Path, cwd: Option<&str>) -> Vec<String> {
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

pub(crate) fn run_codex_exec_with_cancellation(
    prompt: &str,
    output_path: &Path,
    cwd: Option<&str>,
    cancellation: Option<Arc<AtomicBool>>,
) -> BuddyResult<CodexExecOutput> {
    let mut command = create_agent_subprocess_command(Path::new("codex"));
    command
        .args(build_codex_exec_args(output_path, cwd))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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

pub(crate) fn create_codex_output_path(run_id: &str) -> PathBuf {
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
    fn redacts_codex_exec_stderr_before_error_reporting() {
        let message = sanitize_codex_exec_stderr_for_error(
            "auth failed: OPENAI_API_KEY=sk-test-secret\nAuthorization: Bearer live-token",
        );

        assert!(message.contains("OPENAI_API_KEY=[redacted]"));
        assert!(message.contains("Authorization: Bearer [redacted]"));
        assert!(!message.contains("sk-test-secret"));
        assert!(!message.contains("live-token"));
    }
}
