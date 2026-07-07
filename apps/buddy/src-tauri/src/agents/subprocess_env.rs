use std::{collections::BTreeMap, process::Command};

const AGENT_SUBPROCESS_ENV_ALLOWLIST: &[&str] = &[
    "ALL_PROXY",
    "ANTHROPIC_API_BASE",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "CODEX_API_KEY",
    "CODEX_HOME",
    "COLORTERM",
    "CURL_CA_BUNDLE",
    "GITHUB_PAT_TOKEN",
    "HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOGNAME",
    "NIX_SSL_CERT_FILE",
    "NO_PROXY",
    "NODE_EXTRA_CA_CERTS",
    "OPENAI_API_BASE",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORGANIZATION",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT",
    "PATH",
    "REQUESTS_CA_BUNDLE",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "TZ",
    "USER",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "XDG_STATE_HOME",
    "all_proxy",
    "https_proxy",
    "http_proxy",
    "no_proxy",
];

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSubprocessEnvSummary {
    pub passed_keys: Vec<String>,
    pub blocked_keys: Vec<String>,
}

pub fn apply_agent_subprocess_env(command: &mut Command) {
    apply_agent_subprocess_env_from(command, std::env::vars());
}

pub fn apply_agent_subprocess_env_from(
    command: &mut Command,
    source: impl IntoIterator<Item = (String, String)>,
) {
    command.env_clear();
    for (key, value) in build_agent_subprocess_env(source) {
        command.env(key, value);
    }
}

pub fn build_agent_subprocess_env(
    source: impl IntoIterator<Item = (String, String)>,
) -> BTreeMap<String, String> {
    source
        .into_iter()
        .filter(|(key, _)| should_pass_agent_subprocess_env_key(key))
        .collect()
}

pub fn summarize_current_agent_subprocess_env() -> AgentSubprocessEnvSummary {
    summarize_agent_subprocess_env(std::env::vars())
}

pub fn summarize_agent_subprocess_env(
    source: impl IntoIterator<Item = (String, String)>,
) -> AgentSubprocessEnvSummary {
    let mut passed_keys = Vec::new();
    let mut blocked_keys = Vec::new();

    for (key, _) in source {
        if should_pass_agent_subprocess_env_key(&key) {
            passed_keys.push(key);
        } else if should_report_blocked_agent_subprocess_env_key(&key) {
            blocked_keys.push(key);
        }
    }

    passed_keys.sort();
    passed_keys.dedup();
    blocked_keys.sort();
    blocked_keys.dedup();

    AgentSubprocessEnvSummary {
        blocked_keys,
        passed_keys,
    }
}

pub fn should_pass_agent_subprocess_env_key(key: &str) -> bool {
    AGENT_SUBPROCESS_ENV_ALLOWLIST.contains(&key)
}

fn should_report_blocked_agent_subprocess_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    upper == "APP_INTERNAL_KEY"
        || upper == "NODE_OPTIONS"
        || upper == "SSH_AUTH_SOCK"
        || upper.contains("TOKEN")
        || upper.contains("SECRET")
        || upper.contains("PASSWORD")
        || (upper.starts_with("GATEWAY_RELAY_"))
        || (upper.starts_with("AUXILIARY_") && upper.ends_with("_API_KEY"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_subprocess_env_keeps_runtime_provider_proxy_and_certificate_keys() {
        let env = build_agent_subprocess_env([
            ("PATH".to_owned(), "/usr/bin".to_owned()),
            ("HOME".to_owned(), "/home/user".to_owned()),
            ("CODEX_HOME".to_owned(), "/home/user/.codex".to_owned()),
            ("OPENAI_API_KEY".to_owned(), "sk-provider".to_owned()),
            ("ANTHROPIC_API_KEY".to_owned(), "sk-ant".to_owned()),
            ("GITHUB_PAT_TOKEN".to_owned(), "github-pat".to_owned()),
            ("HTTPS_PROXY".to_owned(), "http://127.0.0.1:7890".to_owned()),
            ("SSL_CERT_FILE".to_owned(), "/etc/ssl/cert.pem".to_owned()),
        ]);

        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert_eq!(env.get("HOME").map(String::as_str), Some("/home/user"));
        assert_eq!(
            env.get("CODEX_HOME").map(String::as_str),
            Some("/home/user/.codex")
        );
        assert_eq!(
            env.get("OPENAI_API_KEY").map(String::as_str),
            Some("sk-provider")
        );
        assert_eq!(
            env.get("ANTHROPIC_API_KEY").map(String::as_str),
            Some("sk-ant")
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
    fn agent_subprocess_env_summary_reports_only_key_names() {
        let summary = summarize_agent_subprocess_env([
            ("PATH".to_owned(), "/usr/bin".to_owned()),
            ("OPENAI_API_KEY".to_owned(), "sk-provider".to_owned()),
            ("GITHUB_TOKEN".to_owned(), "ghp-secret".to_owned()),
            ("BUDDY_SESSION_TOKEN".to_owned(), "buddy-secret".to_owned()),
            (
                "NODE_OPTIONS".to_owned(),
                "--require /tmp/hook.js".to_owned(),
            ),
        ]);
        let serialized = serde_json::to_string(&summary).expect("serialize env summary");

        assert_eq!(summary.passed_keys, vec!["OPENAI_API_KEY", "PATH"]);
        assert_eq!(
            summary.blocked_keys,
            vec!["BUDDY_SESSION_TOKEN", "GITHUB_TOKEN", "NODE_OPTIONS"]
        );
        assert!(!serialized.contains("sk-provider"));
        assert!(!serialized.contains("ghp-secret"));
        assert!(!serialized.contains("buddy-secret"));
        assert!(!serialized.contains("/tmp/hook.js"));
    }
}
