use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    error::{BuddyError, BuddyResult},
    memory::stable_hash,
    storage::BuddyMemoryCandidate,
};

pub const GLOBAL_MEMORY_DIR_NAME: &str = "global";
pub const PROJECTS_MEMORY_DIR_NAME: &str = "projects";
pub const MEMORY_FILE_NAME: &str = "MEMORY.md";
pub const MEMORY_SUMMARY_FILE_NAME: &str = "memory_summary.md";
pub const RAW_MEMORIES_FILE_NAME: &str = "raw_memories.md";
pub const ROLLOUT_SUMMARIES_DIR_NAME: &str = "rollout_summaries";
#[cfg_attr(not(test), allow(dead_code))]
const ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX: &str = "<!-- lexora-buddy-memory-candidate:";
#[cfg_attr(not(test), allow(dead_code))]
const GENERATED_MEMORY_START_MARKER: &str = "<!-- lexora-buddy-memory-generated:start -->";
#[cfg_attr(not(test), allow(dead_code))]
const GENERATED_MEMORY_END_MARKER: &str = "<!-- lexora-buddy-memory-generated:end -->";
#[cfg_attr(not(test), allow(dead_code))]
const GENERATED_MEMORY_SUMMARY_START_MARKER: &str =
    "<!-- lexora-buddy-memory-summary-generated:start -->";
#[cfg_attr(not(test), allow(dead_code))]
const GENERATED_MEMORY_SUMMARY_END_MARKER: &str =
    "<!-- lexora-buddy-memory-summary-generated:end -->";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BuddyMemoryWorkspacePaths {
    pub root_dir: PathBuf,
    pub global_dir: PathBuf,
    pub global_memory_file: PathBuf,
    pub global_summary_file: PathBuf,
    pub global_raw_memories_file: PathBuf,
    pub global_rollout_summaries_dir: PathBuf,
    pub projects_dir: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
pub struct BuddyAcceptedMemoryWorkspaceWrite {
    pub relative_path: String,
    pub line_start: i64,
    pub line_end: i64,
    pub content_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
struct BuddyAcceptedMemoryScopePaths {
    memory_file: PathBuf,
    memory_relative_path: String,
    raw_memories_file: PathBuf,
    raw_memories_relative_path: String,
    rollout_summaries_dir: PathBuf,
    rollout_summaries_relative_dir: String,
    summary_file: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
struct BuddyRawMemoryBlock {
    candidate_id: String,
    candidate_type: String,
    rendered_block: String,
    source_event_id: Option<String>,
    source_run_id: Option<String>,
    summary: String,
}

impl BuddyMemoryWorkspacePaths {
    fn from_root(root_dir: &Path) -> Self {
        let root_dir = root_dir.to_path_buf();
        let global_dir = root_dir.join(GLOBAL_MEMORY_DIR_NAME);

        Self {
            global_memory_file: global_dir.join(MEMORY_FILE_NAME),
            global_raw_memories_file: global_dir.join(RAW_MEMORIES_FILE_NAME),
            global_rollout_summaries_dir: global_dir.join(ROLLOUT_SUMMARIES_DIR_NAME),
            global_summary_file: global_dir.join(MEMORY_SUMMARY_FILE_NAME),
            projects_dir: root_dir.join(PROJECTS_MEMORY_DIR_NAME),
            global_dir,
            root_dir,
        }
    }
}

pub fn ensure_memory_workspace(root_dir: &Path) -> BuddyResult<BuddyMemoryWorkspacePaths> {
    let workspace = BuddyMemoryWorkspacePaths::from_root(root_dir);

    fs::create_dir_all(&workspace.global_dir)?;
    fs::create_dir_all(&workspace.global_rollout_summaries_dir)?;
    fs::create_dir_all(&workspace.projects_dir)?;
    ensure_file(
        &workspace.global_memory_file,
        "# Lexora Buddy Memory\n\nAccepted long-term memory will be consolidated here.\n",
    )?;
    ensure_file(&workspace.global_summary_file, "v1\n\n")?;
    ensure_file(
        &workspace.global_raw_memories_file,
        "# Raw Memories\n\nAccepted raw memory entries will be appended here.\n",
    )?;

    Ok(workspace)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn append_accepted_memory_candidate(
    root_dir: &Path,
    candidate: &BuddyMemoryCandidate,
) -> BuddyResult<BuddyAcceptedMemoryWorkspaceWrite> {
    let scope_paths = ensure_accepted_memory_scope_workspace(root_dir, candidate)?;
    let raw_memories_path = scope_paths.raw_memories_file;
    let relative_path = scope_paths.raw_memories_relative_path;
    let marker = accepted_memory_candidate_marker(&candidate.id);
    let existing = fs::read_to_string(&raw_memories_path)?;
    if let Some(existing_write) = find_existing_candidate_block(&existing, &relative_path, &marker)
    {
        return Ok(existing_write);
    }

    let separator = if existing.is_empty() || existing.ends_with("\n\n") {
        ""
    } else if existing.ends_with('\n') {
        "\n"
    } else {
        "\n\n"
    };
    let block = format_accepted_memory_candidate_block(candidate, &marker);
    let line_start = count_lines(&(existing.clone() + separator)) + 1;
    let line_end = line_start + count_lines(&block) - 1;
    fs::write(&raw_memories_path, existing + separator + &block)?;

    Ok(BuddyAcceptedMemoryWorkspaceWrite {
        content_hash: stable_hash(block.trim_end()),
        line_end,
        line_start,
        relative_path,
    })
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn consolidate_accepted_memory_candidate(
    root_dir: &Path,
    candidate: &BuddyMemoryCandidate,
) -> BuddyResult<BuddyAcceptedMemoryWorkspaceWrite> {
    let scope_paths = ensure_accepted_memory_scope_workspace(root_dir, candidate)?;
    let raw_content = fs::read_to_string(&scope_paths.raw_memories_file)?;
    let raw_blocks = parse_raw_memory_blocks(&raw_content);
    if raw_blocks.is_empty() {
        return Err(BuddyError::Validation(
            "memory consolidation requires at least one raw memory block".to_owned(),
        ));
    }

    let source_hash = stable_hash(&raw_content);
    write_rollout_summary_files(
        &scope_paths,
        &scope_paths.raw_memories_relative_path,
        &raw_blocks,
    )?;
    let generated_memory = render_generated_memory_section(
        &scope_paths.raw_memories_relative_path,
        &source_hash,
        &raw_blocks,
    );
    rewrite_generated_section(
        &scope_paths.memory_file,
        "# Lexora Buddy Memory\n\nAccepted long-term memory will be consolidated here.\n",
        GENERATED_MEMORY_START_MARKER,
        GENERATED_MEMORY_END_MARKER,
        &generated_memory,
    )?;
    let generated_summary = render_generated_memory_summary_section(
        &scope_paths.raw_memories_relative_path,
        &scope_paths.rollout_summaries_relative_dir,
        &source_hash,
        &raw_blocks,
    );
    rewrite_generated_section(
        &scope_paths.summary_file,
        "v1\n\n",
        GENERATED_MEMORY_SUMMARY_START_MARKER,
        GENERATED_MEMORY_SUMMARY_END_MARKER,
        &generated_summary,
    )?;

    let memory_content = fs::read_to_string(&scope_paths.memory_file)?;
    let marker = accepted_memory_candidate_marker(&candidate.id);
    find_existing_candidate_block(&memory_content, &scope_paths.memory_relative_path, &marker)
        .ok_or_else(|| {
            BuddyError::Validation(format!(
                "memory candidate {} was not found after consolidation",
                candidate.id
            ))
        })
}

fn ensure_file(path: &Path, initial_content: &str) -> BuddyResult<()> {
    if path.exists() {
        return Ok(());
    }

    fs::write(path, initial_content)?;

    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
fn ensure_accepted_memory_scope_workspace(
    root_dir: &Path,
    candidate: &BuddyMemoryCandidate,
) -> BuddyResult<BuddyAcceptedMemoryScopePaths> {
    let scope_relative_dir = accepted_memory_scope_relative_dir(candidate)?;
    let scope_dir = root_dir.join(&scope_relative_dir);
    let rollout_summaries_dir = scope_dir.join(ROLLOUT_SUMMARIES_DIR_NAME);
    fs::create_dir_all(&rollout_summaries_dir)?;

    let memory_file = scope_dir.join(MEMORY_FILE_NAME);
    let summary_file = scope_dir.join(MEMORY_SUMMARY_FILE_NAME);
    let raw_memories_file = scope_dir.join(RAW_MEMORIES_FILE_NAME);
    ensure_file(
        &memory_file,
        "# Lexora Buddy Memory\n\nAccepted long-term memory will be consolidated here.\n",
    )?;
    ensure_file(&summary_file, "v1\n\n")?;
    ensure_file(
        &raw_memories_file,
        "# Raw Memories\n\nAccepted raw memory entries will be appended here.\n",
    )?;

    Ok(BuddyAcceptedMemoryScopePaths {
        memory_file,
        memory_relative_path: format!("{scope_relative_dir}/{MEMORY_FILE_NAME}"),
        raw_memories_file,
        raw_memories_relative_path: format!("{scope_relative_dir}/{RAW_MEMORIES_FILE_NAME}"),
        rollout_summaries_dir,
        rollout_summaries_relative_dir: format!(
            "{scope_relative_dir}/{ROLLOUT_SUMMARIES_DIR_NAME}"
        ),
        summary_file,
    })
}

#[cfg_attr(not(test), allow(dead_code))]
fn accepted_memory_scope_relative_dir(candidate: &BuddyMemoryCandidate) -> BuddyResult<String> {
    match candidate.scope.as_str() {
        "global" => Ok(GLOBAL_MEMORY_DIR_NAME.to_owned()),
        "project-private" => {
            let Some(project_id) = candidate.project_id.as_deref() else {
                return Err(BuddyError::Validation(
                    "project memory candidate requires project id".to_owned(),
                ));
            };
            Ok(format!(
                "{PROJECTS_MEMORY_DIR_NAME}/{}",
                project_memory_dir_name(project_id)
            ))
        }
        scope => Err(BuddyError::Validation(format!(
            "unsupported memory candidate scope: {scope}"
        ))),
    }
}

#[cfg_attr(not(test), allow(dead_code))]
fn project_memory_dir_name(project_id: &str) -> String {
    format!("project-{}", stable_hash(project_id))
}

#[cfg_attr(not(test), allow(dead_code))]
fn accepted_memory_candidate_marker(candidate_id: &str) -> String {
    format!("{ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX}{candidate_id} -->")
}

#[cfg_attr(not(test), allow(dead_code))]
fn format_accepted_memory_candidate_block(
    candidate: &BuddyMemoryCandidate,
    marker: &str,
) -> String {
    let mut lines = vec![
        marker.to_owned(),
        format!("## {}", candidate.candidate_type),
        String::new(),
        format!("- candidateId: {}", candidate.id),
        format!("- scope: {}", candidate.scope),
    ];
    if let Some(project_id) = candidate.project_id.as_deref() {
        lines.push(format!("- projectId: `{project_id}`"));
    }
    if let Some(run_id) = candidate.run_id.as_deref() {
        lines.push(format!("- sourceRunId: {run_id}"));
    }
    if let Some(event_id) = candidate.source_event_id.as_deref() {
        lines.push(format!("- sourceEventId: {event_id}"));
    }
    lines.push(format!("- sourceLogPath: {}", candidate.source_log_path));
    lines.push(format!("- reason: {}", candidate.reason));
    lines.push(String::new());
    lines.push(candidate.content.trim().to_owned());
    lines.push(String::new());

    lines.join("\n")
}

#[cfg_attr(not(test), allow(dead_code))]
fn parse_raw_memory_blocks(content: &str) -> Vec<BuddyRawMemoryBlock> {
    let lines = content.lines().collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index].trim();
        if !line.starts_with(ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX) {
            index += 1;
            continue;
        }
        let Some(candidate_id) = parse_candidate_id_from_marker(line) else {
            index += 1;
            continue;
        };
        let start = index;
        index += 1;
        while index < lines.len()
            && !lines[index]
                .trim()
                .starts_with(ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX)
        {
            index += 1;
        }
        let rendered_block = lines[start..index].join("\n");
        blocks.push(BuddyRawMemoryBlock {
            candidate_id,
            candidate_type: extract_candidate_type(&rendered_block),
            summary: summarize_memory_block(&rendered_block),
            source_event_id: extract_metadata_value(&rendered_block, "sourceEventId"),
            source_run_id: extract_metadata_value(&rendered_block, "sourceRunId"),
            rendered_block,
        });
    }

    blocks
}

#[cfg_attr(not(test), allow(dead_code))]
fn parse_candidate_id_from_marker(marker: &str) -> Option<String> {
    marker
        .strip_prefix(ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX)?
        .strip_suffix(" -->")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg_attr(not(test), allow(dead_code))]
fn extract_candidate_type(block: &str) -> String {
    block
        .lines()
        .find_map(|line| line.trim().strip_prefix("## "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("memory")
        .to_owned()
}

#[cfg_attr(not(test), allow(dead_code))]
fn extract_metadata_value(block: &str, key: &str) -> Option<String> {
    let prefix = format!("- {key}:");

    block
        .lines()
        .find_map(|line| line.trim().strip_prefix(&prefix))
        .map(str::trim)
        .map(|value| value.trim_matches('`'))
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg_attr(not(test), allow(dead_code))]
fn summarize_memory_block(block: &str) -> String {
    let summary = block
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            (!trimmed.is_empty()
                && !trimmed.starts_with("<!--")
                && !trimmed.starts_with("## ")
                && !trimmed.starts_with("- "))
            .then_some(trimmed)
        })
        .collect::<Vec<_>>()
        .join(" ");

    compact_text(&summary, 160)
}

#[cfg_attr(not(test), allow(dead_code))]
fn write_rollout_summary_files(
    scope_paths: &BuddyAcceptedMemoryScopePaths,
    raw_relative_path: &str,
    blocks: &[BuddyRawMemoryBlock],
) -> BuddyResult<()> {
    for block in blocks {
        let relative_path = rollout_summary_relative_path(
            &scope_paths.rollout_summaries_relative_dir,
            &block.candidate_id,
        );
        let file_name = Path::new(&relative_path)
            .file_name()
            .ok_or_else(|| {
                BuddyError::Validation("rollout summary path is missing file name".to_owned())
            })?
            .to_owned();
        let path = scope_paths.rollout_summaries_dir.join(file_name);
        fs::write(
            path,
            render_rollout_summary(raw_relative_path, &relative_path, block),
        )?;
    }

    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
fn rollout_summary_relative_path(
    rollout_summaries_relative_dir: &str,
    candidate_id: &str,
) -> String {
    format!(
        "{rollout_summaries_relative_dir}/memory-{}.md",
        stable_hash(candidate_id)
    )
}

#[cfg_attr(not(test), allow(dead_code))]
fn render_rollout_summary(
    raw_relative_path: &str,
    relative_path: &str,
    block: &BuddyRawMemoryBlock,
) -> String {
    let mut lines = vec![
        "# Buddy Memory Rollout Summary".to_owned(),
        String::new(),
        format!("- candidateId: {}", block.candidate_id),
        format!("- candidateType: {}", block.candidate_type),
        format!("- rawMemory: `{raw_relative_path}`"),
        format!("- rolloutSummary: `{relative_path}`"),
    ];
    if let Some(source_run_id) = block.source_run_id.as_deref() {
        lines.push(format!("- sourceRunId: {source_run_id}"));
    }
    if let Some(source_event_id) = block.source_event_id.as_deref() {
        lines.push(format!("- sourceEventId: {source_event_id}"));
    }
    lines.extend([
        String::new(),
        "## Accepted Memory".to_owned(),
        String::new(),
        block.summary.clone(),
        String::new(),
        "## Source Block".to_owned(),
        String::new(),
        "```text".to_owned(),
        block.rendered_block.trim_end().to_owned(),
        "```".to_owned(),
        String::new(),
    ]);

    lines.join("\n")
}

#[cfg_attr(not(test), allow(dead_code))]
fn render_generated_memory_section(
    raw_relative_path: &str,
    source_hash: &str,
    blocks: &[BuddyRawMemoryBlock],
) -> String {
    let mut lines = vec![
        GENERATED_MEMORY_START_MARKER.to_owned(),
        String::new(),
        "## Accepted Long-Term Memory".to_owned(),
        String::new(),
        format!("- sourceRawMemory: `{raw_relative_path}`"),
        format!("- sourceHash: {source_hash}"),
        format!("- acceptedCount: {}", blocks.len()),
        String::new(),
    ];
    for block in blocks {
        lines.push(block.rendered_block.trim_end().to_owned());
        lines.push(String::new());
    }
    lines.push(GENERATED_MEMORY_END_MARKER.to_owned());
    lines.push(String::new());

    lines.join("\n")
}

#[cfg_attr(not(test), allow(dead_code))]
fn render_generated_memory_summary_section(
    raw_relative_path: &str,
    rollout_summaries_relative_dir: &str,
    source_hash: &str,
    blocks: &[BuddyRawMemoryBlock],
) -> String {
    let mut lines = vec![
        GENERATED_MEMORY_SUMMARY_START_MARKER.to_owned(),
        format!("- sourceRawMemory: `{raw_relative_path}`"),
        format!("- sourceHash: {source_hash}"),
        format!("- acceptedCount: {}", blocks.len()),
    ];
    for block in blocks {
        let rollout_summary =
            rollout_summary_relative_path(rollout_summaries_relative_dir, &block.candidate_id);
        lines.push(format!(
            "- [{}] {} ({}) rolloutSummary: `{}`",
            block.candidate_type, block.summary, block.candidate_id, rollout_summary
        ));
    }
    lines.push(GENERATED_MEMORY_SUMMARY_END_MARKER.to_owned());
    lines.push(String::new());

    lines.join("\n")
}

#[cfg_attr(not(test), allow(dead_code))]
fn rewrite_generated_section(
    path: &Path,
    initial_content: &str,
    start_marker: &str,
    end_marker: &str,
    generated_section: &str,
) -> BuddyResult<()> {
    ensure_file(path, initial_content)?;
    let existing = fs::read_to_string(path)?;
    let next = if let Some(start) = existing.find(start_marker) {
        let after_start = &existing[start..];
        let Some(relative_end) = after_start.find(end_marker) else {
            return Err(BuddyError::Validation(format!(
                "generated memory section in {} is missing end marker",
                path.display()
            )));
        };
        let end = start + relative_end + end_marker.len();
        let before = existing[..start].trim_end();
        let after = existing[end..].trim_start_matches('\n');
        join_preserved_sections(before, generated_section.trim_end(), after)
    } else {
        join_preserved_sections(existing.trim_end(), generated_section.trim_end(), "")
    };

    fs::write(path, next)?;

    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
fn join_preserved_sections(before: &str, generated: &str, after: &str) -> String {
    let mut sections = Vec::new();
    if !before.trim().is_empty() {
        sections.push(before.trim_end());
    }
    sections.push(generated.trim_end());
    if !after.trim().is_empty() {
        sections.push(after.trim_start_matches('\n').trim_end());
    }

    format!("{}\n", sections.join("\n\n"))
}

#[cfg_attr(not(test), allow(dead_code))]
fn find_existing_candidate_block(
    content: &str,
    relative_path: &str,
    marker: &str,
) -> Option<BuddyAcceptedMemoryWorkspaceWrite> {
    let lines = content.lines().collect::<Vec<_>>();
    let start = lines.iter().position(|line| line.trim() == marker)?;
    let end_exclusive = lines
        .iter()
        .enumerate()
        .skip(start + 1)
        .find_map(|(index, line)| {
            let trimmed = line.trim();
            (trimmed.starts_with(ACCEPTED_MEMORY_CANDIDATE_MARKER_PREFIX)
                || trimmed == GENERATED_MEMORY_END_MARKER)
                .then_some(index)
        })
        .unwrap_or(lines.len());
    let block = lines[start..end_exclusive].join("\n");

    Some(BuddyAcceptedMemoryWorkspaceWrite {
        content_hash: stable_hash(block.trim_end()),
        line_end: end_exclusive as i64,
        line_start: start as i64 + 1,
        relative_path: relative_path.to_owned(),
    })
}

#[cfg_attr(not(test), allow(dead_code))]
fn count_lines(content: &str) -> i64 {
    content.lines().count() as i64
}

#[cfg_attr(not(test), allow(dead_code))]
fn compact_text(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_owned();
    }

    let mut compacted = trimmed
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    compacted.push('…');
    compacted
}
