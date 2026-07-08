#[derive(Debug)]
pub struct CodexAppServerOutput {
    pub final_message: String,
    pub final_memory_citation: Option<serde_json::Value>,
    pub thread_id: String,
    pub turn_id: Option<String>,
}

pub struct CodexAppServerProjectedEvent {
    pub event_type: &'static str,
    pub payload: serde_json::Value,
}

mod app_server;
mod exec;
mod probe;
mod status;

pub use app_server::{
    check_codex_app_server_smoke, load_codex_model_options, load_codex_prompt_context_options,
    run_codex_app_server_turn_with_cancellation_and_approval_handler,
    CodexAppServerApprovalDecision, CodexAppServerApprovalRequest, CodexAppServerTurnRequest,
};
pub(crate) use exec::{create_codex_output_path, run_codex_exec_with_cancellation};
pub use status::{detect_codex_runtime_status, CodexRuntimeStatus};

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelSelection {
    pub model: Option<String>,
    pub service_tier: Option<String>,
    pub effort: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelOption {
    pub runtime: &'static str,
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub default_reasoning_effort: Option<String>,
    pub supported_reasoning_efforts: Vec<CodexReasoningEffortOption>,
    pub service_tiers: Vec<CodexModelServiceTier>,
    pub default_service_tier: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexReasoningEffortOption {
    pub reasoning_effort: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelServiceTier {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(tag = "type")]
pub enum CodexUserInput {
    #[serde(rename = "text")]
    Text {
        text: String,
        #[serde(default, rename = "text_elements")]
        text_elements: Vec<CodexTextElement>,
    },
    #[serde(rename = "image")]
    Image {
        #[serde(default)]
        detail: Option<String>,
        url: String,
    },
    #[serde(rename = "localImage")]
    LocalImage {
        #[serde(default)]
        detail: Option<String>,
        path: String,
    },
    #[serde(rename = "skill")]
    Skill { name: String, path: String },
    #[serde(rename = "mention")]
    Mention { name: String, path: String },
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTextElement {
    pub byte_range: CodexByteRange,
    pub placeholder: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct CodexByteRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptContextOptions {
    pub files: Vec<CodexPromptContextOption>,
    pub plugins: Vec<CodexPromptContextOption>,
    pub skills: Vec<CodexPromptContextOption>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptContextOption {
    pub description: Option<String>,
    pub kind: &'static str,
    pub label: String,
    pub path: Option<String>,
    pub value: String,
}
