#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyApprovalStatus {
    Approved,
    Cancelled,
    Denied,
    Pending,
}

impl BuddyApprovalStatus {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Cancelled => "cancelled",
            Self::Denied => "denied",
            Self::Pending => "pending",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyRuntime {
    Codex,
}

impl BuddyRuntime {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyRuntimeProtocol {
    CodexAppServer,
    CodexExecJsonFallback,
    Unavailable,
}

impl BuddyRuntimeProtocol {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::CodexAppServer => "codex_app_server",
            Self::CodexExecJsonFallback => "codex_exec_json_fallback",
            Self::Unavailable => "unavailable",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyConversationScope {
    Global,
    Project,
}

impl BuddyConversationScope {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::Project => "project",
        }
    }
}

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyMemoryScope {
    Global,
    ProjectPrivate,
}

#[allow(dead_code)]
impl BuddyMemoryScope {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::ProjectPrivate => "project-private",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyMessageRole {
    Assistant,
    User,
}

impl BuddyMessageRole {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Assistant => "assistant",
            Self::User => "user",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyMessageVersionStatus {
    Active,
    Superseded,
}

impl BuddyMessageVersionStatus {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Superseded => "superseded",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyRunEventType {
    AssistantReferences,
    HostAction,
    MemoryCandidateCreated,
    MemoryContextPack,
    MessageCompleted,
    RouterDecision,
    RunCancelled,
    RunCompleted,
    RunExternalRefsUpdated,
    RunFailed,
    RunStarted,
}

impl BuddyRunEventType {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::AssistantReferences => "assistant.references",
            Self::HostAction => "host.action",
            Self::MemoryCandidateCreated => "memory.candidate.created",
            Self::MemoryContextPack => "memory.context_pack",
            Self::MessageCompleted => "message.completed",
            Self::RouterDecision => "router.decision",
            Self::RunCancelled => "run.cancelled",
            Self::RunCompleted => "run.completed",
            Self::RunExternalRefsUpdated => "run.external_refs.updated",
            Self::RunFailed => "run.failed",
            Self::RunStarted => "run.started",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BuddyRunStatus {
    Cancelled,
    Completed,
    Failed,
    Running,
}

impl BuddyRunStatus {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Cancelled => "cancelled",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Running => "running",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BuddyConversationScope, BuddyMemoryScope, BuddyMessageVersionStatus, BuddyRunEventType,
        BuddyRunStatus, BuddyRuntimeProtocol,
    };

    #[test]
    fn serializes_stable_buddy_domain_values_for_sqlite_and_run_events() {
        assert_eq!(
            BuddyRuntimeProtocol::CodexAppServer.as_str(),
            "codex_app_server"
        );
        assert_eq!(BuddyMemoryScope::ProjectPrivate.as_str(), "project-private");
        assert_eq!(BuddyConversationScope::Global.as_str(), "global");
        assert_eq!(BuddyConversationScope::Project.as_str(), "project");
        assert_eq!(BuddyMessageVersionStatus::Active.as_str(), "active");
        assert_eq!(BuddyMessageVersionStatus::Superseded.as_str(), "superseded");
        assert_eq!(BuddyRunStatus::Completed.as_str(), "completed");
        assert_eq!(BuddyRunEventType::RunCompleted.as_str(), "run.completed");
        assert_eq!(
            BuddyRunEventType::RunExternalRefsUpdated.as_str(),
            "run.external_refs.updated"
        );
        assert_eq!(
            BuddyRunEventType::RouterDecision.as_str(),
            "router.decision"
        );
        assert_eq!(
            BuddyRunEventType::MemoryCandidateCreated.as_str(),
            "memory.candidate.created"
        );
        assert_eq!(BuddyRunEventType::HostAction.as_str(), "host.action");
    }
}
