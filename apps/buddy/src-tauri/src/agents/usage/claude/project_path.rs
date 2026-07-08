use std::path::Path;

pub(super) fn resolve_claude_project_path(
    file_path: &Path,
    projects_root: &Path,
) -> Option<String> {
    let project_dir = file_path.parent()?;
    let relative_project_dir = project_dir.strip_prefix(projects_root).ok()?;
    let value = relative_project_dir.to_string_lossy();
    (!value.is_empty()).then(|| value.to_string())
}
