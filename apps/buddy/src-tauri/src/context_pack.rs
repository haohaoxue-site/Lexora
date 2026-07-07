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
    let content = render_context_pack(
        &persona,
        &intent,
        &project_scope,
        &conversation_path,
        &selected_context,
        &memory_eligibility,
        &retrieved_memory,
        &runtime_instruction,
        input.max_chars,
    );

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
    let Some(path) = safe_memory_file_path(memory_root, &source_ref.relative_path) else {
        return Ok(None);
    };
    let content = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };
    let snippet = read_line_range(&content, source_ref.line_start, source_ref.line_end);
    if snippet.trim().is_empty() {
        return Ok(None);
    }
    let citation_label = format!(
        "{}:{}-{}",
        source_ref.relative_path, source_ref.line_start, source_ref.line_end
    );

    Ok(Some(BuddyContextPackRetrievedMemory {
        citation_label,
        content: compact_text(&snippet, 720),
        content_hash: source_ref.content_hash.clone(),
        line_end: source_ref.line_end,
        line_start: source_ref.line_start,
        note: "Accepted Buddy memory file reference.".to_owned(),
        path: source_ref.relative_path.clone(),
        project_id: source_ref.project_id.clone(),
        scope: source_ref.scope.clone(),
        source_event_id: source_ref.source_event_id.clone(),
        source_kind: source_ref.source_kind.clone(),
        source_run_id: source_ref.source_run_id.clone(),
    }))
}

fn safe_memory_file_path(memory_root: &Path, relative_path: &str) -> Option<PathBuf> {
    let relative_path = relative_path.trim();
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

    Some(memory_root.join(path))
}

fn read_line_range(content: &str, line_start: i64, line_end: i64) -> String {
    if line_start <= 0 || line_end < line_start {
        return String::new();
    }
    let start = (line_start - 1) as usize;
    let count = (line_end - line_start + 1) as usize;

    content
        .lines()
        .skip(start)
        .take(count)
        .collect::<Vec<_>>()
        .join("\n")
}

#[allow(clippy::too_many_arguments)]
fn render_context_pack(
    persona: &BuddyContextPackPersona,
    intent: &BuddyContextPackIntent,
    project_scope: &BuddyContextPackProjectScope,
    conversation_path: &BuddyContextPackConversationPath,
    selected_context: &BuddyContextPackSelectedContext,
    memory_eligibility: &BuddyContextPackMemoryEligibility,
    retrieved_memory: &[BuddyContextPackRetrievedMemory],
    runtime_instruction: &BuddyContextPackRuntimeInstruction,
    max_chars: usize,
) -> String {
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
        persona.name,
        persona.role,
        persona.response_language,
        intent.name,
        intent.runtime.as_deref().unwrap_or("none"),
        intent.memory_policy,
        intent.reason,
        project_scope.cwd,
        project_scope.source_project.as_deref().unwrap_or("none"),
        conversation_path.note,
        render_selected_context_summary(selected_context),
        memory_eligibility.retrieval,
        memory_eligibility.candidate_generation,
        memory_eligibility.durable_write,
        memory_eligibility.reasons.join(", ")
    );

    if retrieved_memory.is_empty() {
        content.push_str("- none\n");
    } else {
        for memory in retrieved_memory {
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
            if content.chars().count() + block.chars().count() > max_chars {
                break;
            }
            content.push_str(&block);
        }
    }

    content.push_str("Runtime instruction\n");
    for item in &runtime_instruction.items {
        content.push_str("- ");
        content.push_str(item);
        content.push('\n');
    }

    compact_text(&content, max_chars)
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
