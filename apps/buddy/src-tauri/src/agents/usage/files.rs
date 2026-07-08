use std::{
    fs,
    path::{Path, PathBuf},
};

use super::MAX_USAGE_FILE_COUNT;

pub(super) fn collect_jsonl_files(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = roots.to_vec();

    while let Some(path) = stack.pop() {
        if files.len() >= MAX_USAGE_FILE_COUNT {
            break;
        }

        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };

        if metadata.file_type().is_symlink() {
            continue;
        }

        if metadata.is_file() {
            if path
                .extension()
                .is_some_and(|extension| extension == "jsonl")
            {
                files.push(path);
            }
            continue;
        }

        let Ok(entries) = fs::read_dir(&path) else {
            continue;
        };

        for entry in entries.flatten() {
            stack.push(entry.path());
        }
    }

    files
}

pub(super) fn matching_root_for_file<'a>(
    file_path: &Path,
    roots: &'a [PathBuf],
) -> Option<&'a Path> {
    roots
        .iter()
        .find(|root| file_path.starts_with(root))
        .map(PathBuf::as_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn collects_jsonl_files_without_following_symlinks() {
        let root = std::env::temp_dir().join(format!(
            "lexora-buddy-usage-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let project_dir = root.join("project");
        fs::create_dir_all(&project_dir).expect("create temp project");
        fs::write(project_dir.join("usage.jsonl"), "{}\n").expect("write jsonl");
        fs::write(project_dir.join("notes.txt"), "{}\n").expect("write txt");

        let files = collect_jsonl_files(std::slice::from_ref(&root));

        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].file_name().and_then(|name| name.to_str()),
            Some("usage.jsonl")
        );

        fs::remove_dir_all(root).expect("cleanup temp project");
    }
}
