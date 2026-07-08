use std::path::PathBuf;

use crate::{
    app_paths::BuddyAppPaths,
    commands::{self, StartBuddyAgentTurnRequest},
    error::{BuddyError, BuddyResult},
    state::BuddyAppState,
    storage::{CreateBuddyConversationRequest, UpsertBuddyProjectRequest},
};

const CODEX_SMOKE_CHECK_ARG: &str = "--buddy-codex-smoke-check";
const CODEX_SMOKE_DATA_DIR_ARG: &str = "--buddy-codex-smoke-data-dir";
const CODEX_SMOKE_PROJECT_DIR_ARG: &str = "--buddy-codex-smoke-project-dir";
const CODEX_SMOKE_INPUT_FILE_NAME: &str = "buddy-codex-smoke-input.txt";
const CODEX_SMOKE_OUTPUT_FILE_NAME: &str = "buddy-codex-smoke-output.txt";
const CODEX_SMOKE_MARKER: &str = "lexora-buddy-codex-smoke-ok";

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct BuddyCodexSmokeCheckConfig {
    pub(crate) cleanup_data_dir: bool,
    pub(crate) cleanup_project_dir: bool,
    pub(crate) data_dir: PathBuf,
    pub(crate) project_dir: PathBuf,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyCodexSmokeCheckReport {
    ok: bool,
    assistant_message_preview: String,
    database_path: String,
    event_types: Vec<String>,
    output_file_matches: bool,
    project_root: String,
    protocol: Option<String>,
    run_id: String,
    run_status: String,
    conversation_id: Option<String>,
}

pub fn run_codex_smoke_command_from_env() -> Option<BuddyResult<String>> {
    run_codex_smoke_command(std::env::args())
}

pub fn run_codex_smoke_command<I, S>(args: I) -> Option<BuddyResult<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let config = parse_codex_smoke_check_config(args)?;
    let cleanup_data_dir = config.cleanup_data_dir.then(|| config.data_dir.clone());
    let cleanup_project_dir = config
        .cleanup_project_dir
        .then(|| config.project_dir.clone());

    let result =
        run_codex_smoke_check(config).and_then(|report| Ok(serde_json::to_string(&report)?));

    if let Some(project_dir) = cleanup_project_dir {
        let _ = std::fs::remove_dir_all(project_dir);
    }
    if let Some(data_dir) = cleanup_data_dir {
        let _ = std::fs::remove_dir_all(data_dir);
    }

    Some(result)
}

fn parse_codex_smoke_check_config<I, S>(args: I) -> Option<BuddyCodexSmokeCheckConfig>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_owned())
        .collect::<Vec<_>>();

    if !args.iter().any(|arg| arg == CODEX_SMOKE_CHECK_ARG) {
        return None;
    }

    let explicit_data_dir = read_arg_path(&args, CODEX_SMOKE_DATA_DIR_ARG);
    let explicit_project_dir = read_arg_path(&args, CODEX_SMOKE_PROJECT_DIR_ARG);
    let cleanup_data_dir = explicit_data_dir.is_none();
    let cleanup_project_dir = explicit_project_dir.is_none();
    let data_dir = explicit_data_dir.unwrap_or_else(default_codex_smoke_data_dir);
    let project_dir = explicit_project_dir.unwrap_or_else(default_codex_smoke_project_dir);

    Some(BuddyCodexSmokeCheckConfig {
        cleanup_data_dir,
        cleanup_project_dir,
        data_dir,
        project_dir,
    })
}

fn read_arg_path(args: &[String], name: &str) -> Option<PathBuf> {
    args.windows(2)
        .find(|window| window[0] == name)
        .map(|window| PathBuf::from(&window[1]))
}

fn run_codex_smoke_check(
    config: BuddyCodexSmokeCheckConfig,
) -> BuddyResult<BuddyCodexSmokeCheckReport> {
    std::fs::create_dir_all(&config.data_dir)?;
    std::fs::create_dir_all(&config.project_dir)?;

    let project_root = config.project_dir.canonicalize()?;
    let project_root_text = project_root.to_string_lossy().into_owned();
    let input_path = project_root.join(CODEX_SMOKE_INPUT_FILE_NAME);
    let output_path = project_root.join(CODEX_SMOKE_OUTPUT_FILE_NAME);
    let _ = std::fs::remove_file(&output_path);
    std::fs::write(&input_path, format!("{CODEX_SMOKE_MARKER}\n"))?;

    let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(
        config.data_dir.clone(),
    ))?;
    state.upsert_project(UpsertBuddyProjectRequest {
        name: Some("Codex Smoke".to_owned()),
        root: project_root_text.clone(),
    })?;

    let request = StartBuddyAgentTurnRequest {
        attachments: Vec::new(),
        content: create_codex_smoke_prompt(),
        context_items: Vec::new(),
        conversation_id: None,
        conversation_seed: Some(CreateBuddyConversationRequest {
            forked_from_message_id: None,
            project_root: Some(project_root_text.clone()),
            scope: "project".to_owned(),
            source_conversation_id: None,
            source_run_id: None,
            title: Some("Codex smoke".to_owned()),
        }),
        cwd: Some(project_root_text.clone()),
        inputs: Vec::new(),
        model_selection: None,
    };
    let turn = commands::run_buddy_agent_turn(&state, request)?;
    let output_file_matches = std::fs::read_to_string(&output_path)
        .map(|content| content.trim() == CODEX_SMOKE_MARKER)
        .unwrap_or(false);
    let report = create_codex_smoke_check_report(
        BuddyAppPaths::from_data_dir(config.data_dir.clone()).database_path(),
        project_root_text,
        turn,
        output_file_matches,
    );

    if !report.ok {
        return Err(BuddyError::Runtime(format!(
            "codex smoke failed: run_status={}, output_file_matches={}",
            report.run_status, report.output_file_matches
        )));
    }

    Ok(report)
}

fn create_codex_smoke_prompt() -> String {
    format!(
        "在当前项目目录执行一次 Lexora Buddy Codex smoke check：\n\
         1. 读取 `{CODEX_SMOKE_INPUT_FILE_NAME}`。\n\
         2. 创建或覆盖 `{CODEX_SMOKE_OUTPUT_FILE_NAME}`。\n\
         3. 输出文件内容必须只有 `{CODEX_SMOKE_MARKER}`，末尾可以有换行。\n\
         4. 最终回复只输出 `{CODEX_SMOKE_MARKER}`。\n\
         不要修改其他文件。"
    )
}

fn create_codex_smoke_check_report(
    database_path: PathBuf,
    project_root: String,
    turn: commands::BuddyChatTurn,
    output_file_matches: bool,
) -> BuddyCodexSmokeCheckReport {
    let protocol = turn
        .events
        .iter()
        .find(|event| event.event_type == "run.started")
        .and_then(|event| event.payload.get("protocol"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let event_types = turn
        .events
        .iter()
        .map(|event| event.event_type.clone())
        .collect::<Vec<_>>();
    let assistant_message_preview = turn
        .assistant_message
        .content
        .chars()
        .take(240)
        .collect::<String>();

    BuddyCodexSmokeCheckReport {
        ok: turn.run.status == "completed" && output_file_matches,
        assistant_message_preview,
        database_path: database_path.to_string_lossy().into_owned(),
        event_types,
        output_file_matches,
        project_root,
        protocol,
        run_id: turn.run.id,
        run_status: turn.run.status,
        conversation_id: turn.run.conversation_id,
    }
}

fn default_codex_smoke_data_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "lexora-buddy-codex-smoke-data-{}",
        uuid::Uuid::new_v4()
    ))
}

fn default_codex_smoke_project_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "lexora-buddy-codex-smoke-project-{}",
        uuid::Uuid::new_v4()
    ))
}

#[cfg(test)]
mod tests {
    use super::{create_codex_smoke_check_report, BuddyCodexSmokeCheckReport};
    use crate::{
        commands,
        domain::{BuddyRunEventType, BuddyRunStatus, BuddyRunTerminalStatus},
        storage::{
            AppendBuddyConversationMessageRequest, BuddyRunEvent, BuddyStorage,
            CreateBuddyConversationRequest, CreateBuddyConversationRunRequest,
            CreateBuddyRunEventRequest,
        },
    };
    #[test]
    fn serializes_safe_codex_smoke_summary() {
        let report = create_fake_report("lexora-buddy-codex-smoke-ok", true);
        let output = serde_json::to_string(&report).expect("serialize report");

        assert!(output.contains(r#""ok":true"#));
        assert!(output.contains(r#""protocol":"codex_app_server""#));
        assert!(
            output.contains(r#""eventTypes":["run.started","message.completed","run.completed"]"#)
        );
        assert!(!output.contains("token"));
        assert!(!output.contains("OPENAI_API_KEY"));
    }

    #[test]
    fn marks_report_failed_when_codex_does_not_write_expected_file() {
        let report = create_fake_report("lexora-buddy-codex-smoke-ok", false);

        assert!(!report.ok);
        assert!(!report.output_file_matches);
    }

    fn create_fake_report(
        assistant_content: &str,
        output_file_matches: bool,
    ) -> BuddyCodexSmokeCheckReport {
        let storage = BuddyStorage::new_temporary_for_test().expect("storage");
        let conversation = storage
            .create_conversation(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Codex smoke".to_owned()),
            })
            .expect("conversation");
        let user_message = storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: "smoke".to_owned(),
                conversation_id: conversation.id.clone(),
                parent_message_id: None,
                role: "user".to_owned(),
                run_id: None,
                version_group_id: None,
                version_index: 0,
                version_status: "active".to_owned(),
            })
            .expect("user message");
        let run = storage
            .create_conversation_run(CreateBuddyConversationRunRequest {
                runtime: "codex".to_owned(),
                branch_id: conversation.active_branch_id.clone(),
                conversation_id: conversation.id.clone(),
                cwd: Some("/tmp/lexora-smoke".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                intent: "buddy.agent.turn".to_owned(),
                triggering_message_id: user_message.id.clone(),
            })
            .expect("run");
        let run = storage
            .update_run_status(run.id, BuddyRunStatus::Running)
            .expect("running");
        let started = storage
            .append_run_event(CreateBuddyRunEventRequest::new(
                run.id.clone(),
                BuddyRunEventType::RunStarted,
                serde_json::json!({
                    "protocol": "codex_app_server",
                }),
            ))
            .expect("started");
        let assistant_message = storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: assistant_content.to_owned(),
                conversation_id: conversation.id.clone(),
                parent_message_id: Some(user_message.id.clone()),
                role: "assistant".to_owned(),
                run_id: Some(run.id.clone()),
                version_group_id: None,
                version_index: 0,
                version_status: "active".to_owned(),
            })
            .expect("assistant message");
        let completed = storage
            .finish_run(
                run.id.clone(),
                BuddyRunTerminalStatus::Completed,
                serde_json::json!({
                    "protocol": "codex_app_server",
                }),
            )
            .expect("completed");
        let message_completed = BuddyRunEvent {
            id: started.id + 1,
            run_id: run.id.clone(),
            event_type: "message.completed".to_owned(),
            payload: serde_json::json!({}),
            created_at: started.created_at.clone(),
        };
        let turn = commands::BuddyChatTurn {
            assistant_message,
            events: vec![started, message_completed, completed.event],
            run: completed.run,
            user_message,
        };

        let database_path = crate::app_paths::BuddyAppPaths::from_data_dir(
            std::env::temp_dir().join("lexora-buddy-smoke"),
        )
        .database_path();

        let report = create_codex_smoke_check_report(
            database_path,
            "/tmp/lexora-smoke".to_owned(),
            turn,
            output_file_matches,
        );
        assert!(report.database_path.ends_with("sqlite/state.sqlite3"));

        report
    }
}
