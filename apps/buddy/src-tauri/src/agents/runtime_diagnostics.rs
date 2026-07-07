use crate::agents::{
    claude::{self, ClaudeRuntimeStatus},
    codex::{self, CodexRuntimeStatus},
    subprocess_env::{summarize_current_agent_subprocess_env, AgentSubprocessEnvSummary},
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRuntimeDiagnostics {
    pub claude: BuddyClaudeRuntimeDiagnostics,
    pub codex: BuddyCodexRuntimeDiagnostics,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyCodexRuntimeDiagnostics {
    pub app_server_smoke: BuddyRuntimeSmokeDiagnostics,
    pub codex_home: Option<String>,
    pub status: CodexRuntimeStatus,
    pub subprocess_env: AgentSubprocessEnvSummary,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyClaudeRuntimeDiagnostics {
    pub status: ClaudeRuntimeStatus,
    pub subprocess_env: AgentSubprocessEnvSummary,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRuntimeSmokeDiagnostics {
    pub message: Option<String>,
    pub status: &'static str,
}

pub fn detect_runtime_diagnostics() -> BuddyRuntimeDiagnostics {
    let codex_status = codex::detect_codex_runtime_status();
    let claude_status = claude::detect_claude_runtime_status();
    let subprocess_env = summarize_current_agent_subprocess_env();
    let codex_home = std::env::var("CODEX_HOME")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let app_server_smoke = if codex_status.app_server_available {
        match codex::check_codex_app_server_smoke() {
            Ok(()) => BuddyRuntimeSmokeDiagnostics {
                message: None,
                status: "passed",
            },
            Err(error) => BuddyRuntimeSmokeDiagnostics {
                message: Some(error.to_string()),
                status: "failed",
            },
        }
    } else {
        BuddyRuntimeSmokeDiagnostics {
            message: Some("codex app-server is unavailable".to_owned()),
            status: "skipped",
        }
    };

    create_runtime_diagnostics(
        codex_status,
        claude_status,
        codex_home,
        subprocess_env,
        app_server_smoke,
    )
}

pub fn create_unavailable_runtime_diagnostics(message: String) -> BuddyRuntimeDiagnostics {
    create_runtime_diagnostics(
        CodexRuntimeStatus {
            active_protocol: "unavailable",
            app_server_available: false,
            cli_available: false,
            exec_json_available: false,
            login_status: "unavailable",
            preferred_protocol: "codex_app_server",
            version: None,
        },
        ClaudeRuntimeStatus {
            active_protocol: "unavailable",
            api_provider: None,
            auth_method: None,
            cli_available: false,
            execution_enabled: false,
            login_status: "unavailable",
            memory_isolation_available: false,
            preferred_protocol: "claude_print_stream_json",
            print_mode_available: false,
            stream_json_available: false,
            version: None,
        },
        None,
        AgentSubprocessEnvSummary {
            blocked_keys: Vec::new(),
            passed_keys: Vec::new(),
        },
        BuddyRuntimeSmokeDiagnostics {
            message: Some(message),
            status: "failed",
        },
    )
}

fn create_runtime_diagnostics(
    codex_status: CodexRuntimeStatus,
    claude_status: ClaudeRuntimeStatus,
    codex_home: Option<String>,
    subprocess_env: AgentSubprocessEnvSummary,
    app_server_smoke: BuddyRuntimeSmokeDiagnostics,
) -> BuddyRuntimeDiagnostics {
    BuddyRuntimeDiagnostics {
        claude: BuddyClaudeRuntimeDiagnostics {
            status: claude_status,
            subprocess_env: subprocess_env.clone(),
        },
        codex: BuddyCodexRuntimeDiagnostics {
            app_server_smoke,
            codex_home,
            status: codex_status,
            subprocess_env,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::{
        claude::ClaudeRuntimeStatus, codex::CodexRuntimeStatus,
        subprocess_env::AgentSubprocessEnvSummary,
    };

    #[test]
    fn creates_runtime_diagnostics_without_env_values() {
        let diagnostics = create_runtime_diagnostics(
            CodexRuntimeStatus {
                active_protocol: "codex_app_server",
                app_server_available: true,
                cli_available: true,
                exec_json_available: true,
                login_status: "logged_in",
                preferred_protocol: "codex_app_server",
                version: Some("0.142.3".to_owned()),
            },
            ClaudeRuntimeStatus {
                active_protocol: "status_only",
                api_provider: Some("firstParty".to_owned()),
                auth_method: Some("oauth_token".to_owned()),
                cli_available: true,
                execution_enabled: false,
                login_status: "logged_in",
                memory_isolation_available: true,
                preferred_protocol: "claude_print_stream_json",
                print_mode_available: true,
                stream_json_available: true,
                version: Some("2.1.168".to_owned()),
            },
            Some("/home/user/.codex".to_owned()),
            AgentSubprocessEnvSummary {
                blocked_keys: vec!["GITHUB_TOKEN".to_owned(), "NODE_OPTIONS".to_owned()],
                passed_keys: vec!["OPENAI_API_KEY".to_owned(), "PATH".to_owned()],
            },
            BuddyRuntimeSmokeDiagnostics {
                message: None,
                status: "passed",
            },
        );
        let serialized = serde_json::to_string(&diagnostics).expect("serialize diagnostics");

        assert_eq!(
            diagnostics.codex.codex_home.as_deref(),
            Some("/home/user/.codex")
        );
        assert_eq!(diagnostics.codex.app_server_smoke.status, "passed");
        assert_eq!(
            diagnostics.codex.subprocess_env.passed_keys,
            vec!["OPENAI_API_KEY", "PATH"]
        );
        assert_eq!(
            diagnostics.claude.subprocess_env.blocked_keys,
            vec!["GITHUB_TOKEN", "NODE_OPTIONS"]
        );
        assert!(!serialized.contains("sk-"));
        assert!(!serialized.contains("ghp-"));
        assert!(!serialized.contains("oauth_token_value"));
    }
}
