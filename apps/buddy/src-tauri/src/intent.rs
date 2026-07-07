#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyChatIntent {
    CompanionChat,
    DirectAnswer,
    AgentTask,
    ProjectTask,
    AttachmentTask,
}

impl BuddyChatIntent {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::CompanionChat => "companion_chat",
            Self::DirectAnswer => "direct_answer",
            Self::AgentTask => "agent_task",
            Self::ProjectTask => "project_task",
            Self::AttachmentTask => "attachment_task",
        }
    }
}

pub(crate) struct BuddyIntentClassificationInput<'a> {
    pub(crate) content: &'a str,
    pub(crate) cwd: Option<&'a str>,
    pub(crate) has_attachments: bool,
    pub(crate) has_context_items: bool,
    pub(crate) has_project_scope: bool,
    pub(crate) has_structured_inputs: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct BuddyMemoryEligibility {
    pub(crate) candidate_generation: bool,
    pub(crate) durable_write: bool,
    pub(crate) reasons: &'static [&'static str],
    pub(crate) retrieval: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyMemoryPolicy {
    AttachmentMetadataOnly,
    Disabled,
    Project,
    Standard,
}

impl BuddyMemoryPolicy {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::AttachmentMetadataOnly => "attachment_metadata_only",
            Self::Disabled => "disabled",
            Self::Project => "project",
            Self::Standard => "standard",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BuddyIntentDecision {
    pub(crate) runtime: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) intent: BuddyChatIntent,
    pub(crate) memory_eligibility: BuddyMemoryEligibility,
    pub(crate) memory_policy: BuddyMemoryPolicy,
    pub(crate) reason: String,
    pub(crate) requires_runtime: bool,
}

pub(crate) fn default_agent_task_decision(cwd: Option<&str>) -> BuddyIntentDecision {
    runtime_decision(
        BuddyChatIntent::AgentTask,
        BuddyMemoryPolicy::Standard,
        BuddyMemoryEligibility {
            candidate_generation: true,
            durable_write: true,
            reasons: &["agent_task"],
            retrieval: true,
        },
        "default agent task",
        cwd,
    )
}

pub(crate) fn classify_buddy_intent(
    input: BuddyIntentClassificationInput<'_>,
) -> BuddyIntentDecision {
    if input.has_attachments {
        return runtime_decision(
            BuddyChatIntent::AttachmentTask,
            BuddyMemoryPolicy::AttachmentMetadataOnly,
            BuddyMemoryEligibility {
                candidate_generation: false,
                durable_write: false,
                reasons: &["attachment_untrusted"],
                retrieval: false,
            },
            "attachment input requires runtime and disables memory by default",
            input.cwd,
        );
    }

    if !input.has_context_items
        && !input.has_structured_inputs
        && is_companion_greeting(input.content)
    {
        return BuddyIntentDecision {
            runtime: None,
            cwd: None,
            intent: BuddyChatIntent::CompanionChat,
            memory_eligibility: BuddyMemoryEligibility {
                candidate_generation: false,
                durable_write: false,
                reasons: &["companion_chat"],
                retrieval: false,
            },
            memory_policy: BuddyMemoryPolicy::Disabled,
            reason: "greeting handled as local companion chat".to_owned(),
            requires_runtime: false,
        };
    }

    if !input.has_context_items
        && !input.has_structured_inputs
        && is_direct_answer_question(input.content)
    {
        return BuddyIntentDecision {
            runtime: None,
            cwd: None,
            intent: BuddyChatIntent::DirectAnswer,
            memory_eligibility: BuddyMemoryEligibility {
                candidate_generation: false,
                durable_write: false,
                reasons: &["direct_answer"],
                retrieval: false,
            },
            memory_policy: BuddyMemoryPolicy::Disabled,
            reason: "direct answer handled locally without project memory".to_owned(),
            requires_runtime: false,
        };
    }

    if input.has_project_scope {
        return runtime_decision(
            BuddyChatIntent::ProjectTask,
            BuddyMemoryPolicy::Project,
            BuddyMemoryEligibility {
                candidate_generation: true,
                durable_write: true,
                reasons: &["project_task"],
                retrieval: true,
            },
            "project scope requires runtime and project memory policy",
            input.cwd,
        );
    }

    default_agent_task_decision(input.cwd)
}

fn runtime_decision(
    intent: BuddyChatIntent,
    memory_policy: BuddyMemoryPolicy,
    memory_eligibility: BuddyMemoryEligibility,
    reason: &str,
    cwd: Option<&str>,
) -> BuddyIntentDecision {
    BuddyIntentDecision {
        runtime: Some("codex".to_owned()),
        cwd: cwd.map(str::to_owned),
        intent,
        memory_eligibility,
        memory_policy,
        reason: reason.to_owned(),
        requires_runtime: true,
    }
}

fn is_companion_greeting(content: &str) -> bool {
    let normalized = normalize_companion_text(content);
    matches!(
        normalized.as_str(),
        "hi" | "hello"
            | "hey"
            | "你好"
            | "您好"
            | "嗨"
            | "哈喽"
            | "在吗"
            | "你在吗"
            | "谢谢"
            | "谢了"
            | "多谢"
            | "辛苦了"
    )
}

fn is_direct_answer_question(content: &str) -> bool {
    let normalized = normalize_companion_text(content);
    matches!(
        normalized.as_str(),
        "你是谁"
            | "你是什么"
            | "你能做什么"
            | "你可以做什么"
            | "lexora buddy 是什么"
            | "lexora buddy 是谁"
            | "lexora buddy是什么"
            | "lexora buddy是谁"
    )
}

fn normalize_companion_text(content: &str) -> String {
    content
        .trim()
        .trim_matches(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    '。' | '！' | '？' | '，' | '.' | '!' | '?' | ',' | '~' | '～'
                )
        })
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{
        classify_buddy_intent, BuddyChatIntent, BuddyIntentClassificationInput,
        BuddyMemoryEligibility, BuddyMemoryPolicy,
    };

    #[test]
    fn classifies_greeting_as_companion_chat() {
        let decision = classify_buddy_intent(BuddyIntentClassificationInput {
            content: "你好",
            cwd: Some("/tmp/project"),
            has_attachments: false,
            has_context_items: false,
            has_project_scope: false,
            has_structured_inputs: false,
        });

        assert_eq!(decision.intent, BuddyChatIntent::CompanionChat);
        assert!(!decision.requires_runtime);
        assert_eq!(decision.runtime.as_deref(), None);
        assert_eq!(
            decision.memory_eligibility,
            BuddyMemoryEligibility {
                candidate_generation: false,
                durable_write: false,
                reasons: &["companion_chat"],
                retrieval: false,
            }
        );
        assert_eq!(decision.cwd.as_deref(), None);
        assert_eq!(decision.memory_policy, BuddyMemoryPolicy::Disabled);
        assert!(decision.reason.contains("greeting"));
    }

    #[test]
    fn classifies_project_target_as_project_task() {
        let decision = classify_buddy_intent(BuddyIntentClassificationInput {
            content: "检查当前项目的配置",
            cwd: Some("/tmp/project"),
            has_attachments: false,
            has_context_items: false,
            has_project_scope: true,
            has_structured_inputs: false,
        });

        assert_eq!(decision.intent, BuddyChatIntent::ProjectTask);
        assert!(decision.requires_runtime);
        assert_eq!(decision.runtime.as_deref(), Some("codex"));
        assert_eq!(decision.cwd.as_deref(), Some("/tmp/project"));
        assert_eq!(decision.memory_policy, BuddyMemoryPolicy::Project);
        assert_eq!(decision.memory_eligibility.reasons, &["project_task"]);
        assert!(decision.memory_eligibility.retrieval);
        assert!(decision.memory_eligibility.candidate_generation);
    }

    #[test]
    fn classifies_attachment_as_attachment_task() {
        let decision = classify_buddy_intent(BuddyIntentClassificationInput {
            content: "看看这个文件",
            cwd: Some("/tmp/project"),
            has_attachments: true,
            has_context_items: false,
            has_project_scope: false,
            has_structured_inputs: false,
        });

        assert_eq!(decision.intent, BuddyChatIntent::AttachmentTask);
        assert!(decision.requires_runtime);
        assert_eq!(decision.runtime.as_deref(), Some("codex"));
        assert_eq!(decision.cwd.as_deref(), Some("/tmp/project"));
        assert_eq!(
            decision.memory_policy,
            BuddyMemoryPolicy::AttachmentMetadataOnly
        );
        assert_eq!(
            decision.memory_eligibility.reasons,
            &["attachment_untrusted"]
        );
        assert!(!decision.memory_eligibility.retrieval);
        assert!(!decision.memory_eligibility.durable_write);
    }
}
