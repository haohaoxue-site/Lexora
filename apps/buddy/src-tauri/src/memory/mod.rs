pub mod candidates;
pub mod workspace;

#[cfg_attr(not(test), allow(dead_code))]
pub fn create_chat_turn_memory_content(user_content: &str, assistant_content: &str) -> String {
    format!(
        "用户：{}\nLexora：{}",
        compact_text(user_content, 360),
        compact_text(assistant_content, 720)
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyChatTurnMemorySafety {
    Eligible,
    DisabledSensitiveContent,
    SkipErrorResponse,
}

pub(crate) fn classify_chat_turn_memory_safety(
    user_content: &str,
    assistant_content: &str,
) -> BuddyChatTurnMemorySafety {
    if is_error_like_assistant_response(assistant_content) {
        return BuddyChatTurnMemorySafety::SkipErrorResponse;
    }

    if contains_sensitive_credential(user_content)
        || contains_sensitive_credential(assistant_content)
    {
        return BuddyChatTurnMemorySafety::DisabledSensitiveContent;
    }

    BuddyChatTurnMemorySafety::Eligible
}

pub(crate) fn create_disabled_sensitive_memory_content() -> String {
    "敏感内容已脱敏：本轮包含凭据、cookie、token 或 private key 片段，Buddy 不会写入长期记忆。"
        .to_owned()
}

pub fn compose_prompt_with_context_pack(prompt: &str, context_pack: Option<&str>) -> String {
    match context_pack {
        Some(context_pack) if !context_pack.trim().is_empty() => {
            format!("{}\n用户当前请求：\n{}", context_pack.trim(), prompt.trim())
        }
        _ => prompt.trim().to_owned(),
    }
}

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

fn is_error_like_assistant_response(content: &str) -> bool {
    let normalized = content.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    normalized.starts_with("codex 运行失败")
        || normalized.starts_with("运行失败")
        || normalized.starts_with("处理失败")
        || normalized.starts_with("codex run failed")
        || normalized.contains("runtime returned an error before producing a final answer")
        || normalized.contains("failed before producing a final answer")
}

fn contains_sensitive_credential(content: &str) -> bool {
    if content.trim().is_empty() {
        return false;
    }
    if contains_private_key_block(content) {
        return true;
    }

    content.lines().any(line_contains_sensitive_credential)
}

fn contains_private_key_block(content: &str) -> bool {
    let normalized = content.to_ascii_uppercase();

    normalized.contains("-----BEGIN ") && normalized.contains(" PRIVATE KEY-----")
}

fn line_contains_sensitive_credential(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if contains_bearer_token(&lower) {
        return true;
    }

    SENSITIVE_ASSIGNMENT_KEYS
        .iter()
        .any(|key| contains_secret_assignment(&lower, key))
}

const SENSITIVE_ASSIGNMENT_KEYS: &[&str] = &[
    "access_token",
    "anthropic_api_key",
    "api_key",
    "apikey",
    "auth_token",
    "authorization",
    "client_secret",
    "cookie",
    "id_token",
    "openai_api_key",
    "password",
    "private_key",
    "refresh_token",
    "secret_key",
    "set-cookie",
];

fn contains_bearer_token(line: &str) -> bool {
    let Some(index) = line.find("bearer ") else {
        return false;
    };
    let value = line[index + "bearer ".len()..].trim();

    is_secret_like_value(value)
}

fn contains_secret_assignment(line: &str, key: &str) -> bool {
    let Some(index) = line.find(key) else {
        return false;
    };
    let after_key = line[index + key.len()..]
        .trim_start()
        .trim_start_matches(&['"', '\'', '`'][..])
        .trim_start();
    let Some(value) = after_key
        .strip_prefix('=')
        .or_else(|| after_key.strip_prefix(':'))
    else {
        return false;
    };

    is_secret_like_value(value)
}

fn is_secret_like_value(value: &str) -> bool {
    let value = value.trim().trim_matches(|ch: char| {
        ch.is_ascii_whitespace() || matches!(ch, '"' | '\'' | '`' | ',' | ';')
    });
    if value.len() < 12 {
        return false;
    }

    let token = value
        .split(|ch: char| ch.is_ascii_whitespace() || matches!(ch, '"' | '\'' | '`' | ',' | ';'))
        .next()
        .unwrap_or_default();
    if token.len() < 12 {
        return false;
    }

    let has_secret_prefix = token.starts_with("sk-")
        || token.starts_with("ghp_")
        || token.starts_with("github_pat_")
        || token.starts_with("xoxb-")
        || token.starts_with("akia");
    let has_digit = token.chars().any(|ch| ch.is_ascii_digit());
    let has_alpha = token.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_symbol = token
        .chars()
        .any(|ch| matches!(ch, '_' | '-' | '.' | '/' | '+' | '='));

    has_secret_prefix || (has_digit && has_alpha && has_symbol)
}

pub(crate) fn stable_hash(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_compact_continuity_memory_from_chat_turn() {
        let content =
            create_chat_turn_memory_content("怎么处理 OpenRGB？", "先检查 OpenRGB server。");

        assert!(content.contains("用户：怎么处理 OpenRGB？"));
        assert!(content.contains("Lexora：先检查 OpenRGB server。"));
    }

    #[test]
    fn detects_json_secret_assignment_as_sensitive_memory_content() {
        let safety = classify_chat_turn_memory_safety(
            r#"{"api_key":"sk-json-secret-1234567890abcdef"}"#,
            "不会写入长期记忆",
        );

        assert_eq!(safety, BuddyChatTurnMemorySafety::DisabledSensitiveContent);
    }

    #[test]
    fn composes_exec_prompt_with_context_pack() {
        let prompt = compose_prompt_with_context_pack("继续处理它", Some("context pack"));

        assert!(prompt.starts_with("context pack"));
        assert!(prompt.contains("用户当前请求：\n继续处理它"));
    }

    #[test]
    fn initializes_memory_workspace_global_files_without_overwriting_existing_content() {
        let root = std::env::temp_dir().join(format!(
            "lexora-buddy-memory-workspace-{}",
            uuid::Uuid::new_v4()
        ));
        let workspace =
            workspace::ensure_memory_workspace(&root).expect("initialize memory workspace");

        assert!(workspace.global_memory_file.is_file());
        assert!(workspace.global_summary_file.is_file());
        assert!(workspace.global_raw_memories_file.is_file());
        assert!(workspace.global_rollout_summaries_dir.is_dir());
        assert!(workspace.projects_dir.is_dir());

        std::fs::write(&workspace.global_memory_file, "custom memory")
            .expect("write custom memory");
        workspace::ensure_memory_workspace(&root).expect("reinitialize memory workspace");

        assert_eq!(
            std::fs::read_to_string(&workspace.global_memory_file).expect("read memory"),
            "custom memory"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_global_memory_candidate_into_memory_workspace_and_source_ref() {
        let root = create_memory_test_dir("lexora-buddy-accepted-global-memory");
        let storage =
            crate::storage::BuddyStorage::new_temporary_for_test().expect("create storage");
        let candidate = create_test_memory_candidate(
            &storage,
            "global",
            None,
            "用户偏好：Lexora Buddy 回复要直接说明下一步。",
        );

        let accepted = candidates::accept_memory_candidate(&storage, &root, &candidate.id)
            .expect("accept memory candidate");
        let raw_memory_path = root.join("global/raw_memories.md");
        let raw_memory = std::fs::read_to_string(&raw_memory_path).expect("read raw memories");
        let memory = std::fs::read_to_string(root.join("global/MEMORY.md")).expect("read memory");
        let summary = std::fs::read_to_string(root.join("global/memory_summary.md"))
            .expect("read memory summary");
        let rollout_summary = read_single_rollout_summary(&root.join("global/rollout_summaries"));
        let source_ref_memory = read_line_range_from_file(
            &root.join(&accepted.source_ref.relative_path),
            accepted.source_ref.line_start,
            accepted.source_ref.line_end,
        );
        let refs = storage
            .list_memory_source_refs(candidate.id.clone())
            .expect("list source refs");

        assert_eq!(accepted.candidate.decision, "accepted");
        assert_eq!(accepted.source_ref.source_kind, "buddy_memory_file");
        assert_eq!(accepted.source_ref.scope, "global");
        assert_eq!(accepted.source_ref.project_id, None);
        assert_eq!(accepted.source_ref.relative_path, "global/MEMORY.md");
        assert_eq!(
            accepted.source_ref.source_event_id.as_deref(),
            Some("event-1")
        );
        assert_eq!(
            accepted.source_ref.source_run_id.as_deref(),
            candidate.run_id.as_deref()
        );
        assert!(accepted.source_ref.line_start > 0);
        assert!(accepted.source_ref.line_end >= accepted.source_ref.line_start);
        assert!(!accepted.source_ref.content_hash.is_empty());
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].id, accepted.source_ref.id);
        assert!(raw_memory.contains("lexora-buddy-memory-candidate:"));
        assert!(raw_memory.contains("Lexora Buddy 回复要直接说明下一步"));
        assert!(memory.contains("lexora-buddy-memory-generated:start"));
        assert!(memory.contains("Lexora Buddy 回复要直接说明下一步"));
        assert!(summary.contains("acceptedCount: 1"));
        assert!(summary.contains("global/raw_memories.md"));
        assert!(summary.contains("global/rollout_summaries/"));
        assert!(rollout_summary.contains("Lexora Buddy 回复要直接说明下一步"));
        assert!(rollout_summary.contains("sourceEventId: event-1"));
        assert!(source_ref_memory.contains("Lexora Buddy 回复要直接说明下一步"));
        assert!(storage
            .search_memory_items("Lexora Buddy 回复要直接说明下一步", None, 10)
            .expect("search legacy memories")
            .is_empty());

        let accepted_again = candidates::accept_memory_candidate(&storage, &root, &candidate.id)
            .expect("accept memory candidate again");
        let raw_memory_after =
            std::fs::read_to_string(&raw_memory_path).expect("read raw memories again");
        let memory_after =
            std::fs::read_to_string(root.join("global/MEMORY.md")).expect("read memory again");

        assert_eq!(accepted_again.source_ref.id, accepted.source_ref.id);
        assert_eq!(raw_memory_after, raw_memory);
        assert_eq!(memory_after, memory);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_project_memory_candidate_into_project_raw_memories_without_leaking_cwd_in_path() {
        let root = create_memory_test_dir("lexora-buddy-accepted-project-memory");
        let storage =
            crate::storage::BuddyStorage::new_temporary_for_test().expect("create storage");
        let project_root = create_memory_test_dir("lexora-buddy-project-root");
        let project_id = project_root.to_string_lossy().into_owned();
        let candidate = create_test_memory_candidate(
            &storage,
            "project-private",
            Some(project_id.as_str()),
            "项目事实：project-alpha 的 Buddy 记忆必须留在项目作用域。",
        );

        let accepted = candidates::accept_memory_candidate(&storage, &root, &candidate.id)
            .expect("accept project memory candidate");
        let raw_memory = std::fs::read_to_string(
            root.join(
                accepted
                    .source_ref
                    .relative_path
                    .replace("MEMORY.md", "raw_memories.md"),
            ),
        )
        .expect("read project raw memories");
        let memory = std::fs::read_to_string(root.join(&accepted.source_ref.relative_path))
            .expect("read project memory");
        let summary = std::fs::read_to_string(
            root.join(
                accepted
                    .source_ref
                    .relative_path
                    .replace("MEMORY.md", "memory_summary.md"),
            ),
        )
        .expect("read project memory summary");
        let rollout_summary = read_single_rollout_summary(
            &root.join(
                accepted
                    .source_ref
                    .relative_path
                    .replace("MEMORY.md", "rollout_summaries"),
            ),
        );

        assert_eq!(accepted.candidate.decision, "accepted");
        assert_eq!(accepted.source_ref.scope, "project-private");
        assert_eq!(
            accepted.source_ref.project_id.as_deref(),
            Some(project_id.as_str())
        );
        assert!(accepted
            .source_ref
            .relative_path
            .starts_with("projects/project-"));
        assert!(accepted.source_ref.relative_path.ends_with("/MEMORY.md"));
        assert!(!accepted
            .source_ref
            .relative_path
            .contains(project_id.as_str()));
        assert!(raw_memory.contains("project-alpha 的 Buddy 记忆必须留在项目作用域"));
        assert!(memory.contains("project-alpha 的 Buddy 记忆必须留在项目作用域"));
        assert!(summary.contains("acceptedCount: 1"));
        assert!(summary.contains("rollout_summaries/"));
        assert!(rollout_summary.contains("project-alpha 的 Buddy 记忆必须留在项目作用域"));

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(project_root);
    }

    fn create_test_memory_candidate(
        storage: &crate::storage::BuddyStorage,
        scope: &str,
        project_id: Option<&str>,
        content: &str,
    ) -> crate::storage::BuddyMemoryCandidate {
        if let Some(project_id) = project_id {
            storage
                .upsert_project(crate::storage::UpsertBuddyProjectRequest {
                    name: Some("Accepted Memory Project".to_owned()),
                    root: project_id.to_owned(),
                })
                .expect("authorize project");
        }
        let session = storage
            .create_session(crate::storage::CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: project_id.map(str::to_owned),
                scope: if project_id.is_some() {
                    "project".to_owned()
                } else {
                    "global".to_owned()
                },
                title: Some("Accepted memory".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(crate::storage::CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: project_id.map(str::to_owned),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");

        storage
            .create_memory_candidate(crate::storage::CreateBuddyMemoryCandidateRequest {
                candidate_type: "continuity.chat_turn".to_owned(),
                confidence: 0.92,
                content: content.to_owned(),
                conversation_id: None,
                decision: "accepted".to_owned(),
                eligibility: serde_json::json!({
                    "candidateGeneration": true,
                    "durableWrite": true,
                    "retrieval": true
                }),
                project_id: project_id.map(str::to_owned),
                reason: "accepted test candidate".to_owned(),
                run_id: Some(run.id.clone()),
                scope: scope.to_owned(),
                source_event_id: Some("event-1".to_owned()),
                source_log_path: "runs/test-run.jsonl".to_owned(),
                source_refs: serde_json::json!([
                    {
                        "sourceKind": "run_log",
                        "sourceRunId": run.id,
                        "sourceEventId": "event-1"
                    }
                ]),
            })
            .expect("create memory candidate")
    }

    fn create_memory_test_dir(prefix: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create memory test dir");
        root
    }

    fn read_line_range_from_file(path: &std::path::Path, line_start: i64, line_end: i64) -> String {
        let content = std::fs::read_to_string(path).expect("read line range file");

        content
            .lines()
            .skip((line_start - 1) as usize)
            .take((line_end - line_start + 1) as usize)
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn read_single_rollout_summary(path: &std::path::Path) -> String {
        let entries = std::fs::read_dir(path)
            .expect("read rollout summaries")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect rollout summaries");
        assert_eq!(entries.len(), 1);

        std::fs::read_to_string(entries[0].path()).expect("read rollout summary")
    }
}
