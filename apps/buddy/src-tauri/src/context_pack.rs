use std::path::{Path, PathBuf};

use crate::{
    error::BuddyResult,
    intent::{BuddyIntentDecision, BuddyMemoryEligibility},
    memory::stable_hash,
    storage::BuddyMemorySourceRef,
};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPack {
    pub content: String,
    pub hash: String,
    pub persona: BuddyContextPackPersona,
    pub intent: BuddyContextPackIntent,
    pub project_scope: BuddyContextPackProjectScope,
    pub conversation_path: BuddyContextPackConversationPath,
    pub selected_context: BuddyContextPackSelectedContext,
    pub memory_eligibility: BuddyContextPackMemoryEligibility,
    pub retrieved_memory: Vec<BuddyContextPackRetrievedMemory>,
    pub runtime_instruction: BuddyContextPackRuntimeInstruction,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackPersona {
    pub name: String,
    pub role: String,
    pub response_language: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackIntent {
    pub name: String,
    pub runtime: Option<String>,
    pub memory_policy: String,
    pub reason: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackProjectScope {
    pub cwd: String,
    pub source_project: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackConversationPath {
    pub note: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackSelectedContext {
    pub items: Vec<BuddyContextPackSelectedContextItem>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackSelectedContextItem {
    pub kind: String,
    pub label: String,
    pub path: Option<String>,
    pub description: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackMemoryEligibility {
    pub candidate_generation: bool,
    pub durable_write: bool,
    pub reasons: Vec<String>,
    pub retrieval: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackRetrievedMemory {
    pub source_kind: String,
    pub path: String,
    pub line_start: i64,
    pub line_end: i64,
    pub scope: String,
    pub project_id: Option<String>,
    pub source_run_id: Option<String>,
    pub source_event_id: Option<String>,
    pub note: String,
    pub content: String,
    pub content_hash: String,
    pub citation_label: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackRuntimeInstruction {
    pub items: Vec<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackDiagnostic {
    pub injected: bool,
    pub not_modified: bool,
    pub pack_hash: Option<String>,
    pub source_memory_ids: Vec<String>,
    pub persona: BuddyContextPackPersona,
    pub intent: BuddyContextPackIntent,
    pub project_scope: BuddyContextPackProjectScope,
    pub conversation_path: BuddyContextPackConversationPath,
    pub selected_context: BuddyContextPackSelectedContext,
    pub memory_eligibility: BuddyContextPackMemoryEligibility,
    pub retrieved_memory: Vec<BuddyContextPackRetrievedMemory>,
    pub runtime_instruction: BuddyContextPackRuntimeInstruction,
}

pub struct BuddyContextPackBuildInput<'a> {
    pub memory_root: &'a Path,
    pub runtime_cwd: &'a str,
    pub source_project: Option<&'a str>,
    pub intent_decision: &'a BuddyIntentDecision,
    pub selected_context: &'a [BuddyContextPackSelectedContextItem],
    pub source_refs: &'a [BuddyMemorySourceRef],
    pub max_chars: usize,
}

pub fn build_context_pack(input: BuddyContextPackBuildInput<'_>) -> BuddyResult<BuddyContextPack> {
    let persona = BuddyContextPackPersona {
        name: "Lexora Buddy".to_owned(),
        role: "Lexora 本地桌面伙伴，负责把用户对话、项目授权、运行事件和 Buddy 自有记忆组织给外部 agent runtime。"
            .to_owned(),
        response_language: "zh-CN".to_owned(),
    };
    let intent = BuddyContextPackIntent {
        runtime: input.intent_decision.runtime.clone(),
        memory_policy: input.intent_decision.memory_policy.as_str().to_owned(),
        name: input.intent_decision.intent.as_str().to_owned(),
        reason: input.intent_decision.reason.clone(),
    };
    let project_scope = BuddyContextPackProjectScope {
        cwd: input.runtime_cwd.to_owned(),
        source_project: input.source_project.map(str::to_owned),
    };
    let conversation_path = BuddyContextPackConversationPath {
        note: "当前用户消息在 user turn 中提供；context pack 只作为结构化运行上下文。".to_owned(),
    };
    let selected_context = BuddyContextPackSelectedContext {
        items: input.selected_context.to_vec(),
    };
    let memory_eligibility = create_memory_eligibility(input.intent_decision.memory_eligibility);
    let retrieved_memory = input
        .source_refs
        .iter()
        .filter_map(|source_ref| read_retrieved_memory(input.memory_root, source_ref).transpose())
        .collect::<BuddyResult<Vec<_>>>()?;
    let runtime_instruction = BuddyContextPackRuntimeInstruction {
        items: vec![
            "以 Lexora Buddy 的身份回应，默认使用中文，直接处理用户当前请求。".to_owned(),
            "retrievedMemory 只是 Buddy 已接受的长期记忆文件引用；当前用户请求优先级更高。"
                .to_owned(),
            "不要写入或修改 Codex / Claude Code 原生记忆。".to_owned(),
            "不要要求用户检查 .lexora 配置，除非当前任务明确需要本地 Buddy 配置诊断。".to_owned(),
        ],
    };
    let content = render_context_pack(BuddyContextPackRenderInput {
        persona: &persona,
        intent: &intent,
        project_scope: &project_scope,
        conversation_path: &conversation_path,
        selected_context: &selected_context,
        memory_eligibility: &memory_eligibility,
        retrieved_memory: &retrieved_memory,
        runtime_instruction: &runtime_instruction,
        max_chars: input.max_chars,
    });

    Ok(BuddyContextPack {
        hash: stable_hash(&content),
        content,
        persona,
        intent,
        project_scope,
        conversation_path,
        selected_context,
        memory_eligibility,
        retrieved_memory,
        runtime_instruction,
    })
}

pub fn create_context_pack_diagnostic(
    context_pack: &BuddyContextPack,
    previous_pack_hash: Option<&str>,
) -> BuddyContextPackDiagnostic {
    BuddyContextPackDiagnostic {
        injected: true,
        not_modified: previous_pack_hash == Some(context_pack.hash.as_str()),
        pack_hash: Some(context_pack.hash.clone()),
        source_memory_ids: Vec::new(),
        persona: context_pack.persona.clone(),
        intent: context_pack.intent.clone(),
        project_scope: context_pack.project_scope.clone(),
        conversation_path: context_pack.conversation_path.clone(),
        selected_context: context_pack.selected_context.clone(),
        memory_eligibility: context_pack.memory_eligibility.clone(),
        retrieved_memory: context_pack.retrieved_memory.clone(),
        runtime_instruction: context_pack.runtime_instruction.clone(),
    }
}

pub fn context_pack_state_key(session_id: &str, runtime: &str, cwd: &str) -> String {
    format!(
        "buddy.contextPack.last.{session_id}.{runtime}.{}",
        stable_hash(cwd)
    )
}

pub fn context_pack_diagnostics_key(run_id: &str) -> String {
    format!("buddy.contextPack.diagnostics.{run_id}")
}

fn create_memory_eligibility(
    eligibility: BuddyMemoryEligibility,
) -> BuddyContextPackMemoryEligibility {
    BuddyContextPackMemoryEligibility {
        candidate_generation: eligibility.candidate_generation,
        durable_write: eligibility.durable_write,
        reasons: eligibility
            .reasons
            .iter()
            .map(|reason| (*reason).to_owned())
            .collect(),
        retrieval: eligibility.retrieval,
    }
}

fn read_retrieved_memory(
    memory_root: &Path,
    source_ref: &BuddyMemorySourceRef,
) -> BuddyResult<Option<BuddyContextPackRetrievedMemory>> {
    let Some(resolved_ref) = BuddyContextPackSourceRef::resolve(memory_root, source_ref) else {
        return Ok(None);
    };
    let content = std::fs::read_to_string(&resolved_ref.absolute_path)?;
    let snippet = read_line_range(&content, resolved_ref.line_range);
    if snippet.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(BuddyContextPackRetrievedMemory {
        citation_label: resolved_ref.citation_label(),
        content: compact_text(&snippet, 720),
        content_hash: source_ref.content_hash.clone(),
        line_end: resolved_ref.line_range.line_end,
        line_start: resolved_ref.line_range.line_start,
        note: "Accepted Buddy memory file reference.".to_owned(),
        path: resolved_ref.relative_path.to_owned(),
        project_id: source_ref.project_id.clone(),
        scope: source_ref.scope.clone(),
        source_event_id: source_ref.source_event_id.clone(),
        source_kind: source_ref.source_kind.clone(),
        source_run_id: source_ref.source_run_id.clone(),
    }))
}

struct BuddyContextPackSourceRef<'a> {
    absolute_path: PathBuf,
    line_range: BuddyContextPackLineRange,
    relative_path: &'a str,
}

impl<'a> BuddyContextPackSourceRef<'a> {
    fn resolve(memory_root: &Path, source_ref: &'a BuddyMemorySourceRef) -> Option<Self> {
        let relative_path = checked_memory_relative_path(source_ref.relative_path.trim())?;
        let line_range =
            BuddyContextPackLineRange::new(source_ref.line_start, source_ref.line_end)?;

        Some(Self {
            absolute_path: memory_root.join(relative_path),
            line_range,
            relative_path,
        })
    }

    fn citation_label(&self) -> String {
        format!(
            "{}:{}-{}",
            self.relative_path, self.line_range.line_start, self.line_range.line_end
        )
    }
}

fn checked_memory_relative_path(relative_path: &str) -> Option<&str> {
    if relative_path.is_empty() || relative_path.starts_with('/') {
        return None;
    }
    let path = Path::new(relative_path);
    if path
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return None;
    }

    Some(relative_path)
}

fn read_line_range(content: &str, line_range: BuddyContextPackLineRange) -> String {
    content
        .lines()
        .skip(line_range.zero_based_start)
        .take(line_range.count)
        .collect::<Vec<_>>()
        .join("\n")
}

#[derive(Clone, Copy)]
struct BuddyContextPackLineRange {
    count: usize,
    line_end: i64,
    line_start: i64,
    zero_based_start: usize,
}

impl BuddyContextPackLineRange {
    fn new(line_start: i64, line_end: i64) -> Option<Self> {
        if line_start <= 0 || line_end < line_start {
            return None;
        }

        Some(Self {
            count: usize::try_from(line_end - line_start + 1).ok()?,
            line_end,
            line_start,
            zero_based_start: usize::try_from(line_start - 1).ok()?,
        })
    }
}

struct BuddyContextPackRenderInput<'a> {
    persona: &'a BuddyContextPackPersona,
    intent: &'a BuddyContextPackIntent,
    project_scope: &'a BuddyContextPackProjectScope,
    conversation_path: &'a BuddyContextPackConversationPath,
    selected_context: &'a BuddyContextPackSelectedContext,
    memory_eligibility: &'a BuddyContextPackMemoryEligibility,
    retrieved_memory: &'a [BuddyContextPackRetrievedMemory],
    runtime_instruction: &'a BuddyContextPackRuntimeInstruction,
    max_chars: usize,
}

fn render_context_pack(input: BuddyContextPackRenderInput<'_>) -> String {
    let mut content = format!(
        "Lexora Buddy context pack\n\
         Persona\n\
         - name: {}\n\
         - role: {}\n\
         - responseLanguage: {}\n\
         Intent\n\
         - name: {}\n\
         - runtime: {}\n\
         - memoryPolicy: {}\n\
         - reason: {}\n\
         Project scope\n\
         - cwd: {}\n\
         - sourceProject: {}\n\
         Conversation path\n\
         - {}\n\
         Selected context\n\
         - items: {}\n\
         Memory eligibility\n\
         - retrieval: {}\n\
         - candidateGeneration: {}\n\
         - durableWrite: {}\n\
         - reasons: {}\n\
         Retrieved memory\n",
        input.persona.name,
        input.persona.role,
        input.persona.response_language,
        input.intent.name,
        input.intent.runtime.as_deref().unwrap_or("none"),
        input.intent.memory_policy,
        input.intent.reason,
        input.project_scope.cwd,
        input
            .project_scope
            .source_project
            .as_deref()
            .unwrap_or("none"),
        input.conversation_path.note,
        render_selected_context_summary(input.selected_context),
        input.memory_eligibility.retrieval,
        input.memory_eligibility.candidate_generation,
        input.memory_eligibility.durable_write,
        input.memory_eligibility.reasons.join(", ")
    );

    if input.retrieved_memory.is_empty() {
        content.push_str("- none\n");
    } else {
        for memory in input.retrieved_memory {
            let block = format!(
                "- [{}] {} scope={} sourceRunId={} sourceEventId={}\n  note: {}\n  excerpt:\n{}\n",
                memory.source_kind,
                memory.citation_label,
                memory.scope,
                memory.source_run_id.as_deref().unwrap_or("none"),
                memory.source_event_id.as_deref().unwrap_or("none"),
                memory.note,
                indent_block(&memory.content, "  ")
            );
            if content.chars().count() + block.chars().count() > input.max_chars {
                break;
            }
            content.push_str(&block);
        }
    }

    content.push_str("Runtime instruction\n");
    for item in &input.runtime_instruction.items {
        content.push_str("- ");
        content.push_str(item);
        content.push('\n');
    }

    compact_text(&content, input.max_chars)
}

fn indent_block(content: &str, prefix: &str) -> String {
    content
        .lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_selected_context_summary(selected_context: &BuddyContextPackSelectedContext) -> String {
    if selected_context.items.is_empty() {
        return "none".to_owned();
    }

    selected_context
        .items
        .iter()
        .map(|item| {
            let mut parts = vec![format!("{}: {}", item.kind, item.label)];
            if let Some(path) = item.path.as_deref() {
                parts.push(format!("path={path}"));
            }
            if let Some(description) = item.description.as_deref() {
                parts.push(format!("description={description}"));
            }
            parts.join(" ")
        })
        .collect::<Vec<_>>()
        .join("; ")
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

#[cfg(test)]
mod tests {
    use super::{read_line_range, BuddyContextPackLineRange, BuddyContextPackSourceRef};
    use crate::storage::BuddyMemorySourceRef;

    #[test]
    fn read_line_range_returns_requested_one_based_span() {
        let content = "alpha\nbeta\ngamma\ndelta";
        let line_range = BuddyContextPackLineRange::new(2, 3).expect("line range");

        assert_eq!(read_line_range(content, line_range), "beta\ngamma");
    }

    #[test]
    fn line_range_rejects_invalid_ranges() {
        assert!(BuddyContextPackLineRange::new(0, 1).is_none());
        assert!(BuddyContextPackLineRange::new(2, 1).is_none());
    }

    #[test]
    fn source_ref_rejects_paths_outside_memory_root() {
        let mut source_ref = memory_source_ref("../outside.md", 1, 1);

        assert!(
            BuddyContextPackSourceRef::resolve(std::path::Path::new("/tmp"), &source_ref).is_none()
        );

        source_ref.relative_path = "/absolute.md".to_owned();
        assert!(
            BuddyContextPackSourceRef::resolve(std::path::Path::new("/tmp"), &source_ref).is_none()
        );
    }

    #[test]
    fn source_ref_resolves_safe_path_and_citation_label() {
        let source_ref = memory_source_ref("global/MEMORY.md", 4, 6);
        let resolved =
            BuddyContextPackSourceRef::resolve(std::path::Path::new("/tmp/memory"), &source_ref)
                .expect("source ref");

        assert_eq!(
            resolved.absolute_path,
            std::path::Path::new("/tmp/memory/global/MEMORY.md")
        );
        assert_eq!(resolved.citation_label(), "global/MEMORY.md:4-6");
    }

    fn memory_source_ref(
        relative_path: &str,
        line_start: i64,
        line_end: i64,
    ) -> BuddyMemorySourceRef {
        BuddyMemorySourceRef {
            candidate_id: "candidate-1".to_owned(),
            content_hash: "hash-1".to_owned(),
            created_at: "2026-01-01T00:00:00.000Z".to_owned(),
            id: "source-ref-1".to_owned(),
            line_end,
            line_start,
            project_id: None,
            relative_path: relative_path.to_owned(),
            scope: "global".to_owned(),
            source_event_id: None,
            source_kind: "buddy_memory_file".to_owned(),
            source_log_path: None,
            source_run_id: None,
        }
    }
}
