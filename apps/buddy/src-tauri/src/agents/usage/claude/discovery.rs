use std::{env, fs, path::PathBuf};

const CLAUDE_DEFAULT_CONFIG_DIR: &str = ".claude";
const CLAUDE_XDG_CONFIG_DIR: &str = ".config/claude";

pub(in crate::agents::usage) fn discover_claude_usage_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(raw_config_dirs) = env::var("CLAUDE_CONFIG_DIR") {
        for raw_config_dir in raw_config_dirs.split(',') {
            let config_dir = raw_config_dir.trim();
            if config_dir.is_empty() {
                continue;
            }

            push_existing_claude_usage_root(&mut roots, PathBuf::from(config_dir));
        }

        return roots;
    }

    let Some(home_dir) = env::var_os("HOME").map(PathBuf::from) else {
        return roots;
    };

    push_existing_claude_usage_root(&mut roots, home_dir.join(CLAUDE_XDG_CONFIG_DIR));
    push_existing_claude_usage_root(&mut roots, home_dir.join(CLAUDE_DEFAULT_CONFIG_DIR));

    roots
}

fn push_existing_claude_usage_root(roots: &mut Vec<PathBuf>, config_or_projects_dir: PathBuf) {
    let candidates = if config_or_projects_dir
        .file_name()
        .is_some_and(|name| name == "projects")
    {
        vec![config_or_projects_dir]
    } else {
        vec![
            config_or_projects_dir.join("projects"),
            config_or_projects_dir,
        ]
    };

    for candidate in candidates {
        if !candidate.is_dir() {
            continue;
        }

        let normalized = fs::canonicalize(&candidate).unwrap_or(candidate);
        if roots.iter().any(|root| root == &normalized) {
            continue;
        }

        roots.push(normalized);
    }
}
