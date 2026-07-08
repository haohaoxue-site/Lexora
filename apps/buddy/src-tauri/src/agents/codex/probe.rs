use std::path::Path;

use crate::agents::subprocess_env::create_agent_subprocess_command_from_env;

pub(super) fn run_codex_success_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    run_codex_success_probe_with_program_and_env(Path::new("codex"), args, std::env::vars())
}

fn run_codex_success_probe_with_program_and_env<const N: usize>(
    program: &Path,
    args: [&str; N],
    env_source: impl IntoIterator<Item = (String, String)>,
) -> Option<String> {
    let mut command = create_agent_subprocess_command_from_env(program, env_source);
    command.args(args);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    Some(format_codex_probe_output(output.stdout, output.stderr))
}

pub(super) fn run_codex_output_probe<const N: usize>(args: [&str; N]) -> Option<String> {
    run_codex_output_probe_with_program_and_env(Path::new("codex"), args, std::env::vars())
}

fn run_codex_output_probe_with_program_and_env<const N: usize>(
    program: &Path,
    args: [&str; N],
    env_source: impl IntoIterator<Item = (String, String)>,
) -> Option<String> {
    let mut command = create_agent_subprocess_command_from_env(program, env_source);
    command.args(args);
    let output = command.output().ok()?;

    Some(format_codex_probe_output(output.stdout, output.stderr))
}

fn format_codex_probe_output(stdout: Vec<u8>, stderr: Vec<u8>) -> String {
    let stdout = String::from_utf8_lossy(&stdout);
    let stderr = String::from_utf8_lossy(&stderr);

    format!("{stdout}{stderr}").trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(unix)]
    fn codex_success_probe_passes_only_agent_subprocess_env_to_child() {
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

        let output = run_codex_success_probe_with_program_and_env(
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

    #[test]
    #[cfg(unix)]
    fn codex_success_probe_includes_stderr_from_successful_command() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-probe-stderr-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex");
        fs::write(
            &script_path,
            "#!/bin/sh\nprintf '%s\n' 'codex-cli 9.9.9'\nprintf '%s\n' '--json' >&2\n",
        )
        .expect("write fake codex");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake codex executable");

        let output = run_codex_success_probe_with_program_and_env(
            &script_path,
            ["exec", "--help"],
            Vec::<(String, String)>::new(),
        )
        .expect("probe output");

        assert!(output.contains("codex-cli 9.9.9"));
        assert!(output.contains("--json"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn codex_success_probe_returns_none_for_failed_command() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-probe-failed-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex");
        fs::write(&script_path, "#!/bin/sh\nexit 42\n").expect("write fake codex");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake codex executable");

        let output = run_codex_success_probe_with_program_and_env(
            &script_path,
            ["--version"],
            Vec::<(String, String)>::new(),
        );

        assert_eq!(output, None);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    #[cfg(unix)]
    fn codex_output_probe_returns_output_from_failed_command() {
        use std::{fs, os::unix::fs::PermissionsExt};

        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-codex-output-probe-failed-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("codex");
        fs::write(
            &script_path,
            "#!/bin/sh\nprintf '%s\n' 'Not logged in. Run codex login.' >&2\nexit 1\n",
        )
        .expect("write fake codex");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make fake codex executable");

        let output = run_codex_output_probe_with_program_and_env(
            &script_path,
            ["login", "status"],
            Vec::<(String, String)>::new(),
        )
        .expect("probe output");

        assert_eq!(output, "Not logged in. Run codex login.");

        let _ = fs::remove_dir_all(temp_dir);
    }
}
