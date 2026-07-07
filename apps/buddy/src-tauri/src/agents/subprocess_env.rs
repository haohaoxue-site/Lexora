use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command,
};

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
    "PNPM_HOME",
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

pub fn create_agent_subprocess_command(program: &Path) -> Command {
    create_agent_subprocess_command_from_env(program, std::env::vars())
}

pub fn create_agent_subprocess_command_from_env(
    program: &Path,
    source: impl IntoIterator<Item = (String, String)>,
) -> Command {
    let env = build_agent_subprocess_env(source);
    let mut command = Command::new(resolve_agent_subprocess_program(program, &env));
    apply_agent_subprocess_env_map(&mut command, &env);

    command
}

pub fn apply_agent_subprocess_env_map(command: &mut Command, env: &BTreeMap<String, String>) {
    command.env_clear();
    for (key, value) in env {
        command.env(key, value);
    }
}

pub fn build_agent_subprocess_env(
    source: impl IntoIterator<Item = (String, String)>,
) -> BTreeMap<String, String> {
    let mut env = source
        .into_iter()
        .filter(|(key, _)| should_pass_agent_subprocess_env_key(key))
        .collect::<BTreeMap<_, _>>();

    enrich_agent_subprocess_env(&mut env);

    env
}

pub fn summarize_current_agent_subprocess_env() -> AgentSubprocessEnvSummary {
    summarize_agent_subprocess_env(std::env::vars())
}

pub fn summarize_agent_subprocess_env(
    source: impl IntoIterator<Item = (String, String)>,
) -> AgentSubprocessEnvSummary {
    let source = source.into_iter().collect::<Vec<_>>();
    let effective_env = build_agent_subprocess_env(source.clone());
    let mut passed_keys = effective_env.keys().cloned().collect::<Vec<_>>();
    let mut blocked_keys = Vec::new();

    for (key, _) in source {
        if !should_pass_agent_subprocess_env_key(&key)
            && should_report_blocked_agent_subprocess_env_key(&key)
        {
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

pub fn resolve_agent_subprocess_program(program: &Path, env: &BTreeMap<String, String>) -> PathBuf {
    if program.is_absolute() || program.components().count() != 1 {
        return program.to_path_buf();
    }

    let Some(program_name) = program.to_str().filter(|value| !value.is_empty()) else {
        return program.to_path_buf();
    };
    let Some(path) = env.get("PATH") else {
        return program.to_path_buf();
    };

    for dir in std::env::split_paths(path) {
        let candidate = dir.join(program_name);
        if is_executable_file(&candidate) {
            return candidate;
        }
    }

    program.to_path_buf()
}

fn enrich_agent_subprocess_env(env: &mut BTreeMap<String, String>) {
    let Some(home) = env
        .get("HOME")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    else {
        return;
    };

    prepend_existing_user_runtime_dirs(env, &home);
    infer_codex_home(env, &home);
}

fn prepend_existing_user_runtime_dirs(env: &mut BTreeMap<String, String>, home: &Path) {
    let mut current_paths = env
        .get("PATH")
        .map(|path| std::env::split_paths(path).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut discovered_paths = candidate_user_runtime_dirs(env, home)
        .into_iter()
        .filter(|path| path.is_dir())
        .filter(|path| !current_paths.iter().any(|current| current == path))
        .collect::<Vec<_>>();

    if discovered_paths.is_empty() {
        return;
    }

    discovered_paths.append(&mut current_paths);
    if let Ok(joined) = std::env::join_paths(discovered_paths) {
        env.insert("PATH".to_owned(), joined.to_string_lossy().into_owned());
    }
}

fn candidate_user_runtime_dirs(env: &BTreeMap<String, String>, home: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(pnpm_home) = env
        .get("PNPM_HOME")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let pnpm_home = PathBuf::from(pnpm_home);
        dirs.push(pnpm_home.join("bin"));
        dirs.push(pnpm_home);
    }

    let xdg_data_home = env
        .get("XDG_DATA_HOME")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/share"));

    dirs.push(xdg_data_home.join("pnpm/bin"));
    dirs.push(xdg_data_home.join("pnpm"));
    dirs.push(home.join(".local/bin"));
    dirs.push(home.join("bin"));
    dirs.push(home.join(".cargo/bin"));
    dirs.push(home.join(".bun/bin"));
    dirs.push(home.join(".deno/bin"));
    dirs.push(home.join(".npm-global/bin"));
    dirs.push(home.join(".yarn/bin"));

    dirs
}

fn infer_codex_home(env: &mut BTreeMap<String, String>, home: &Path) {
    if env
        .get("CODEX_HOME")
        .is_some_and(|value| !value.trim().is_empty())
    {
        return;
    }

    let codex_home = home.join(".codex");
    if codex_home.is_dir() {
        env.insert(
            "CODEX_HOME".to_owned(),
            codex_home.to_string_lossy().into_owned(),
        );
    }
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
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
    #[cfg(unix)]
    fn agent_subprocess_env_discovers_user_runtime_paths_and_codex_home() {
        use std::fs;

        let home = std::env::temp_dir().join(format!(
            "lexora-buddy-agent-env-home-{}",
            uuid::Uuid::new_v4()
        ));
        let pnpm_bin = home.join(".local/share/pnpm/bin");
        let codex_home = home.join(".codex");
        fs::create_dir_all(&pnpm_bin).expect("create pnpm bin");
        fs::create_dir_all(&codex_home).expect("create codex home");

        let env = build_agent_subprocess_env([
            ("PATH".to_owned(), "/usr/bin".to_owned()),
            ("HOME".to_owned(), home.to_string_lossy().into_owned()),
        ]);
        let path_entries =
            std::env::split_paths(env.get("PATH").expect("PATH")).collect::<Vec<_>>();

        assert_eq!(path_entries.first(), Some(&pnpm_bin));
        assert_eq!(
            env.get("CODEX_HOME").map(String::as_str),
            Some(codex_home.to_string_lossy().as_ref())
        );

        let _ = fs::remove_dir_all(home);
    }

    #[test]
    #[cfg(unix)]
    fn resolves_agent_program_from_effective_user_runtime_path() {
        use std::{fs, os::unix::fs::PermissionsExt, path::Path};

        let home = std::env::temp_dir().join(format!(
            "lexora-buddy-agent-program-home-{}",
            uuid::Uuid::new_v4()
        ));
        let pnpm_bin = home.join(".local/share/pnpm/bin");
        fs::create_dir_all(&pnpm_bin).expect("create pnpm bin");
        let codex_path = pnpm_bin.join("codex");
        fs::write(&codex_path, "#!/bin/sh\n").expect("write fake codex");
        fs::set_permissions(&codex_path, fs::Permissions::from_mode(0o755))
            .expect("make fake codex executable");

        let env = build_agent_subprocess_env([
            ("PATH".to_owned(), "/usr/bin".to_owned()),
            ("HOME".to_owned(), home.to_string_lossy().into_owned()),
        ]);

        assert_eq!(
            resolve_agent_subprocess_program(Path::new("codex"), &env),
            codex_path
        );

        let _ = fs::remove_dir_all(home);
    }

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
