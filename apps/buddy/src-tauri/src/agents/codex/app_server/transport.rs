use std::{
    collections::VecDeque,
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    thread::JoinHandle,
    time::Duration,
};

use crate::{
    agents::redaction::sanitize_process_stderr_line,
    agents::subprocess_env::{
        apply_agent_subprocess_env_map, build_agent_subprocess_env,
        resolve_agent_subprocess_program,
    },
    error::{BuddyError, BuddyResult},
};

const STDERR_TAIL_LINE_LIMIT: usize = 20;
const STDERR_TAIL_LINE_CHAR_LIMIT: usize = 500;

pub(super) struct CodexAppServerTransport {
    child: CodexAppServerProcessHandle,
    reader: BufReader<ChildStdout>,
    stderr_tail: CodexAppServerStderrTail,
    stdin: Option<ChildStdin>,
}

#[derive(Clone)]
pub(super) struct CodexAppServerProcessHandle {
    child: Arc<Mutex<Option<Child>>>,
}

pub(super) struct CodexAppServerCancellationWatcher {
    join_handle: Option<JoinHandle<()>>,
    stop: Arc<AtomicBool>,
}

impl CodexAppServerTransport {
    pub(super) fn spawn(program: &Path) -> BuddyResult<Self> {
        let mut child = spawn_codex_app_server(program).map_err(|error| {
            BuddyError::Codex(format!("failed to start codex app-server: {error}"))
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| BuddyError::Codex("failed to open codex app-server stdin".to_owned()))?;
        let stdout = child.stdout.take().ok_or_else(|| {
            BuddyError::Codex("failed to open codex app-server stdout".to_owned())
        })?;
        let stderr_tail = CodexAppServerStderrTail::start(child.stderr.take());
        let child = CodexAppServerProcessHandle::new(child);

        Ok(Self {
            child,
            reader: BufReader::new(stdout),
            stderr_tail,
            stdin: Some(stdin),
        })
    }

    pub(super) fn send(&mut self, message: serde_json::Value) -> BuddyResult<()> {
        let serialized = serde_json::to_string(&message)?;
        let stdin = self.stdin.as_mut().ok_or_else(|| {
            BuddyError::Codex("codex app-server stdin was already closed".to_owned())
        })?;
        writeln!(stdin, "{serialized}")?;
        stdin.flush()?;

        Ok(())
    }

    pub(super) fn read_line(&mut self) -> BuddyResult<String> {
        let mut line = String::new();
        let read = self.reader.read_line(&mut line)?;
        if read == 0 {
            self.child.terminate();
            return Err(self.codex_closed_transport_error("codex app-server closed the transport"));
        }

        Ok(line.trim().to_owned())
    }

    fn codex_closed_transport_error(&self, message: impl Into<String>) -> BuddyError {
        BuddyError::Codex(format_message_with_stderr_tail(
            message.into(),
            self.stderr_tail.snapshot_after_reader_finished(),
        ))
    }

    pub(super) fn spawn_cancellation_watcher(
        &self,
        cancellation: Arc<AtomicBool>,
    ) -> CodexAppServerCancellationWatcher {
        self.child.spawn_cancellation_watcher(cancellation)
    }

    pub(super) fn close(mut self) {
        drop(self.stdin.take());
        self.child.terminate();
    }
}

impl Drop for CodexAppServerTransport {
    fn drop(&mut self) {
        self.child.terminate();
    }
}

impl CodexAppServerProcessHandle {
    fn new(child: Child) -> Self {
        Self {
            child: Arc::new(Mutex::new(Some(child))),
        }
    }

    fn terminate(&self) {
        let Some(mut child) = self.child.lock().ok().and_then(|mut child| child.take()) else {
            return;
        };

        let _ = child.kill();
        let _ = child.wait();
    }

    fn spawn_cancellation_watcher(
        &self,
        cancellation: Arc<AtomicBool>,
    ) -> CodexAppServerCancellationWatcher {
        let process = self.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let watcher_stop = Arc::clone(&stop);
        let join_handle = thread::spawn(move || {
            while !watcher_stop.load(Ordering::SeqCst) {
                if cancellation.load(Ordering::SeqCst) {
                    process.terminate();
                    break;
                }

                thread::sleep(Duration::from_millis(50));
            }
        });

        CodexAppServerCancellationWatcher {
            join_handle: Some(join_handle),
            stop,
        }
    }
}

impl Drop for CodexAppServerCancellationWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

struct CodexAppServerStderrTail {
    join_handle: Mutex<Option<JoinHandle<()>>>,
    lines: Arc<Mutex<VecDeque<String>>>,
}

impl CodexAppServerStderrTail {
    fn start(stderr: Option<ChildStderr>) -> Self {
        let tail = Self {
            join_handle: Mutex::new(None),
            lines: Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_TAIL_LINE_LIMIT))),
        };
        let Some(stderr) = stderr else {
            return tail;
        };

        let lines = Arc::clone(&tail.lines);
        let join_handle = thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                push_stderr_tail_line(&lines, sanitize_process_stderr_line(&line));
            }
        });
        if let Ok(mut handle) = tail.join_handle.lock() {
            *handle = Some(join_handle);
        }

        tail
    }

    fn snapshot_after_reader_finished(&self) -> Option<String> {
        if let Ok(mut handle) = self.join_handle.lock() {
            if let Some(handle) = handle.take() {
                let _ = handle.join();
            }
        }

        self.snapshot_lines()
    }

    fn snapshot_lines(&self) -> Option<String> {
        let lines = self.lines.lock().ok()?;
        if lines.is_empty() {
            return None;
        }

        Some(lines.iter().cloned().collect::<Vec<_>>().join(" | "))
    }
}

fn spawn_codex_app_server(program: &Path) -> std::io::Result<Child> {
    spawn_codex_app_server_with_env(program, std::env::vars())
}

fn spawn_codex_app_server_with_env(
    program: &Path,
    env_source: impl IntoIterator<Item = (String, String)>,
) -> std::io::Result<Child> {
    let mut last_error = None;
    let subprocess_env = build_agent_subprocess_env(env_source);
    let resolved_program = resolve_agent_subprocess_program(program, &subprocess_env);

    for attempt in 0..4 {
        let mut command = Command::new(&resolved_program);
        command
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        apply_agent_subprocess_env_map(&mut command, &subprocess_env);

        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error) if error.raw_os_error() == Some(26) && attempt < 3 => {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        std::io::Error::other("text-file-busy retry exited without a spawn error")
    }))
}

fn push_stderr_tail_line(lines: &Arc<Mutex<VecDeque<String>>>, line: String) {
    let Ok(mut lines) = lines.lock() else {
        return;
    };
    if lines.len() >= STDERR_TAIL_LINE_LIMIT {
        lines.pop_front();
    }
    lines.push_back(truncate_stderr_line(line));
}

fn truncate_stderr_line(line: String) -> String {
    let mut chars = line.chars();
    let truncated = chars
        .by_ref()
        .take(STDERR_TAIL_LINE_CHAR_LIMIT)
        .collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn format_message_with_stderr_tail(message: String, stderr_tail: Option<String>) -> String {
    match stderr_tail {
        Some(stderr_tail) if !stderr_tail.trim().is_empty() => {
            format!("{message}; stderr tail: {stderr_tail}")
        }
        _ => message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subprocess_env(pairs: &[(&str, &str)]) -> std::collections::BTreeMap<String, String> {
        build_agent_subprocess_env(
            pairs
                .iter()
                .map(|(key, value)| (key.to_string(), value.to_string())),
        )
    }

    #[test]
    fn codex_app_server_subprocess_env_keeps_runtime_provider_and_network_inputs() {
        let env = subprocess_env(&[
            ("PATH", "/usr/bin:/home/user/.local/bin"),
            ("HOME", "/home/user"),
            ("LANG", "zh_CN.UTF-8"),
            ("XDG_CONFIG_HOME", "/home/user/.config"),
            ("CODEX_HOME", "/home/user/.codex"),
            ("OPENAI_API_KEY", "sk-provider"),
            ("OPENAI_BASE_URL", "https://api.openai.example"),
            ("GITHUB_PAT_TOKEN", "github-pat"),
            ("HTTPS_PROXY", "http://127.0.0.1:7890"),
            ("SSL_CERT_FILE", "/etc/ssl/cert.pem"),
        ]);

        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some("/usr/bin:/home/user/.local/bin")
        );
        assert_eq!(env.get("HOME").map(String::as_str), Some("/home/user"));
        assert_eq!(env.get("LANG").map(String::as_str), Some("zh_CN.UTF-8"));
        assert_eq!(
            env.get("XDG_CONFIG_HOME").map(String::as_str),
            Some("/home/user/.config")
        );
        assert_eq!(
            env.get("CODEX_HOME").map(String::as_str),
            Some("/home/user/.codex")
        );
        assert_eq!(
            env.get("OPENAI_API_KEY").map(String::as_str),
            Some("sk-provider")
        );
        assert_eq!(
            env.get("OPENAI_BASE_URL").map(String::as_str),
            Some("https://api.openai.example")
        );
        assert_eq!(
            env.get("GITHUB_PAT_TOKEN").map(String::as_str),
            Some("github-pat")
        );
        assert_eq!(
            env.get("HTTPS_PROXY").map(String::as_str),
            Some("http://127.0.0.1:7890")
        );
        assert_eq!(
            env.get("SSL_CERT_FILE").map(String::as_str),
            Some("/etc/ssl/cert.pem")
        );
    }

    #[test]
    fn codex_app_server_subprocess_env_strips_buddy_platform_and_generic_secrets() {
        let env = subprocess_env(&[
            ("PATH", "/usr/bin"),
            ("OPENAI_API_KEY", "sk-provider"),
            ("GITHUB_TOKEN", "ghp-secret"),
            ("GH_TOKEN", "gh-secret"),
            ("BUDDY_SESSION_TOKEN", "buddy-secret"),
            ("LEXORA_SESSION_TOKEN", "lexora-secret"),
            ("APP_INTERNAL_KEY", "internal-secret"),
            ("DASHBOARD_SESSION_TOKEN", "dashboard-secret"),
            ("GATEWAY_RELAY_TOKEN", "gateway-secret"),
            ("GATEWAY_RELAY_API_KEY", "gateway-api-secret"),
            ("AUXILIARY_WORKER_API_KEY", "aux-secret"),
            ("HF_TOKEN", "hf-secret"),
            ("SSH_AUTH_SOCK", "/tmp/ssh-agent.sock"),
            ("NODE_OPTIONS", "--require /tmp/steal.js"),
        ]);

        assert!(env.contains_key("PATH"));
        assert!(env.contains_key("OPENAI_API_KEY"));
        for stripped in [
            "GITHUB_TOKEN",
            "GH_TOKEN",
            "BUDDY_SESSION_TOKEN",
            "LEXORA_SESSION_TOKEN",
            "APP_INTERNAL_KEY",
            "DASHBOARD_SESSION_TOKEN",
            "GATEWAY_RELAY_TOKEN",
            "GATEWAY_RELAY_API_KEY",
            "AUXILIARY_WORKER_API_KEY",
            "HF_TOKEN",
            "SSH_AUTH_SOCK",
            "NODE_OPTIONS",
        ] {
            assert!(
                !env.contains_key(stripped),
                "{stripped} should not reach codex app-server"
            );
        }
    }

    #[test]
    #[cfg(unix)]
    fn codex_app_server_spawn_only_passes_allowlisted_env_to_child() {
        use std::{fs, io::Read, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-env-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
printf '%s\n' "PATH=$PATH"
printf '%s\n' "OPENAI_API_KEY=$OPENAI_API_KEY"
printf '%s\n' "GITHUB_PAT_TOKEN=$GITHUB_PAT_TOKEN"
printf '%s\n' "GITHUB_TOKEN=${GITHUB_TOKEN-unset}"
printf '%s\n' "NODE_OPTIONS=${NODE_OPTIONS-unset}"
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut child = spawn_codex_app_server_with_env(
            &script_path,
            vec![
                ("PATH".to_owned(), "/usr/bin".to_owned()),
                ("OPENAI_API_KEY".to_owned(), "sk-provider".to_owned()),
                ("GITHUB_PAT_TOKEN".to_owned(), "github-pat".to_owned()),
                ("GITHUB_TOKEN".to_owned(), "ghp-secret".to_owned()),
                (
                    "NODE_OPTIONS".to_owned(),
                    "--require /tmp/steal.js".to_owned(),
                ),
            ],
        )
        .expect("spawn fake app-server");
        let mut stdout = String::new();
        child
            .stdout
            .take()
            .expect("stdout should be piped")
            .read_to_string(&mut stdout)
            .expect("read fake app-server stdout");
        let status = child.wait().expect("wait for fake app-server");

        assert!(status.success());
        assert!(stdout.contains("PATH=/usr/bin"));
        assert!(stdout.contains("OPENAI_API_KEY=sk-provider"));
        assert!(stdout.contains("GITHUB_PAT_TOKEN=github-pat"));
        assert!(stdout.contains("GITHUB_TOKEN=unset"));
        assert!(stdout.contains("NODE_OPTIONS=unset"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn cancellation_watcher_terminates_app_server_child() {
        use std::{
            fs,
            os::unix::fs::PermissionsExt,
            sync::{
                atomic::{AtomicBool, Ordering},
                Arc,
            },
            time::{Duration, Instant},
        };

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-app-server-cancel-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex-app-server");
        let script = r#"#!/bin/sh
printf '%s\n' '{"id":0,"result":{}}'
while true; do
  sleep 1
done
"#;
        fs::write(&script_path, script).expect("write fake app-server");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake app-server executable");

        let mut transport =
            CodexAppServerTransport::spawn(&script_path).expect("spawn fake app-server");
        assert_eq!(
            transport.read_line().expect("read initial response"),
            r#"{"id":0,"result":{}}"#
        );

        let cancellation = Arc::new(AtomicBool::new(false));
        let _watcher = transport.spawn_cancellation_watcher(Arc::clone(&cancellation));
        let started_at = Instant::now();
        cancellation.store(true, Ordering::SeqCst);

        let error = transport
            .read_line()
            .expect_err("cancelled app-server should close stdout");

        assert!(error.to_string().contains("closed the transport"));
        assert!(started_at.elapsed() < Duration::from_secs(2));

        let _ = fs::remove_dir_all(temp_dir);
    }
}
