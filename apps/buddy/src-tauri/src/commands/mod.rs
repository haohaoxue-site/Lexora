use std::{path::PathBuf, sync::mpsc};

use tauri::{AppHandle, Emitter, State, Window};

use crate::{
    agents::{
        claude::{self, ClaudeRuntimeStatus},
        codex::{self, CodexRuntimeStatus},
        runtime_diagnostics::{self, BuddyRuntimeDiagnostics},
        usage::{self, BuddyUsageSnapshot},
    },
    app_config::{
        BuddyAppSettings, UpdateBuddyAppSettingsRequest, BUDDY_APP_SETTINGS_CHANGED_EVENT,
    },
    context_pack, desktop_shell,
    error::{BuddyError, BuddyResult},
    native_pet::NativePetSidecarProcess,
    state::{BuddyAppState, BuddyLocalStateStatus},
    storage::{
        BuddyConversation, BuddyMessage, BuddyProject, BuddyRun, BuddySession, BuddySetting,
        CreateBuddyMessageRequest, CreateBuddySessionRequest, UpsertBuddyProjectRequest,
    },
};

pub(crate) mod agent_turn;
pub(crate) mod approval;
pub(crate) mod attachment;
mod chat_input;
mod codex_runtime;
mod host_action;
pub(crate) mod run_events;
mod run_state;
mod runtime_events;

pub use self::agent_turn::{BuddyChatTurn, StartBuddyAgentTurnRequest};
pub use self::run_state::BuddyRunCancellationRegistry;

pub(crate) use self::agent_turn::run_buddy_agent_turn;

use self::{codex_runtime::record_codex_run_cancelled, run_state::BuddyRunStateEventPublisher};

type BuddyCommandResult<T> = Result<T, BuddyCommandError>;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyCommandError {
    message: String,
}

impl From<BuddyError> for BuddyCommandError {
    fn from(error: BuddyError) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

async fn run_buddy_blocking<T>(
    operation: &'static str,
    run: impl FnOnce() -> BuddyResult<T> + Send + 'static,
) -> BuddyCommandResult<T>
where
    T: Send + 'static,
{
    let result = tauri::async_runtime::spawn_blocking(run)
        .await
        .map_err(|error| BuddyError::Runtime(format!("{operation} worker failed: {error}")))?;

    result.map_err(Into::into)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRuntimeStatus {
    shell: &'static str,
    app_name: &'static str,
    version: &'static str,
    desktop_ready: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyWindowFrameState {
    is_maximized: bool,
    is_always_on_top: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBuddyCodexPromptContextOptionsRequest {
    cwd: Option<String>,
    file_query: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunDiagnostics {
    run_id: String,
    context_pack: BuddyContextPackDiagnostics,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyContextPackDiagnostics {
    available: bool,
    injected: bool,
    key: String,
    not_modified: bool,
    pack_hash_prefix: Option<String>,
    source_count: usize,
    updated_at: Option<String>,
}

#[tauri::command]
pub fn get_buddy_runtime_status() -> BuddyRuntimeStatus {
    BuddyRuntimeStatus {
        shell: "tauri",
        app_name: "Lexora",
        version: env!("CARGO_PKG_VERSION"),
        desktop_ready: true,
    }
}

#[tauri::command]
pub fn get_buddy_app_settings(
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<BuddyAppSettings> {
    Ok(state.app_settings()?)
}

#[tauri::command]
pub fn update_buddy_app_settings(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
    request: UpdateBuddyAppSettingsRequest,
) -> BuddyCommandResult<BuddyAppSettings> {
    let settings = state.update_app_settings(request)?;
    app.emit(BUDDY_APP_SETTINGS_CHANGED_EVENT, &settings)
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    Ok(settings)
}

#[tauri::command]
pub fn show_buddy_panel(app: AppHandle) -> BuddyCommandResult<()> {
    Ok(desktop_shell::show_panel(&app)?)
}

#[tauri::command]
pub fn show_buddy_chat(app: AppHandle) -> BuddyCommandResult<()> {
    Ok(desktop_shell::show_chat(&app)?)
}

#[tauri::command]
pub fn hide_buddy_current_window(window: Window) -> BuddyCommandResult<()> {
    Ok(desktop_shell::hide_current_window(&window)?)
}

#[tauri::command]
pub fn get_buddy_current_window_frame_state(
    window: Window,
) -> BuddyCommandResult<BuddyWindowFrameState> {
    buddy_current_window_frame_state(&window)
}

#[tauri::command]
pub fn set_buddy_current_window_always_on_top(
    window: Window,
    always_on_top: bool,
) -> BuddyCommandResult<BuddyWindowFrameState> {
    desktop_shell::set_window_always_on_top(&window, always_on_top)?;
    buddy_current_window_frame_state(&window)
}

#[tauri::command]
pub fn minimize_buddy_current_window(window: Window) -> BuddyCommandResult<()> {
    window
        .minimize()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
        .map_err(Into::into)
}

#[tauri::command]
pub fn toggle_buddy_current_window_maximize(
    window: Window,
) -> BuddyCommandResult<BuddyWindowFrameState> {
    if window
        .is_maximized()
        .map_err(|error| BuddyError::Runtime(error.to_string()))?
    {
        window
            .unmaximize()
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    } else {
        window
            .maximize()
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    buddy_current_window_frame_state(&window)
}

#[tauri::command]
pub fn start_buddy_current_window_dragging(window: Window) -> BuddyCommandResult<()> {
    window
        .start_dragging()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
        .map_err(Into::into)
}

#[tauri::command]
pub fn set_buddy_native_pet_animation(
    pet_process: State<'_, NativePetSidecarProcess>,
    animation: String,
) -> BuddyCommandResult<()> {
    Ok(pet_process.set_animation(&animation)?)
}

#[tauri::command]
pub fn control_buddy_native_pet_host_action(
    pet_process: State<'_, NativePetSidecarProcess>,
    action: serde_json::Value,
) -> BuddyCommandResult<()> {
    Ok(pet_process.control_host_action(action)?)
}

fn buddy_current_window_frame_state(window: &Window) -> BuddyCommandResult<BuddyWindowFrameState> {
    Ok(BuddyWindowFrameState {
        is_maximized: window
            .is_maximized()
            .map_err(|error| BuddyError::Runtime(error.to_string()))?,
        is_always_on_top: desktop_shell::window_is_always_on_top(window)?,
    })
}

fn pick_buddy_project_folder(
    app: &AppHandle,
) -> BuddyCommandResult<Option<UpsertBuddyProjectRequest>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(pick_buddy_project_folder_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive project folder selection".to_owned()))?
        .map_err(Into::into)
}

fn pick_buddy_project_folder_on_main_thread() -> BuddyResult<Option<UpsertBuddyProjectRequest>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    use gtk::prelude::{FileChooserExt, NativeDialogExt};

    let dialog = gtk::FileChooserNative::new(
        Some("选择项目文件夹"),
        gtk::Window::NONE,
        gtk::FileChooserAction::SelectFolder,
        Some("选择"),
        Some("取消"),
    );
    let response = dialog.run();
    let request = if response == gtk::ResponseType::Accept {
        dialog
            .filename()
            .map(create_project_authorization_request_from_selected_folder)
            .transpose()?
    } else {
        None
    };
    dialog.destroy();

    Ok(request)
}

fn create_project_authorization_request_from_selected_folder(
    folder: PathBuf,
) -> BuddyResult<UpsertBuddyProjectRequest> {
    let root = folder.into_os_string().into_string().map_err(|_| {
        BuddyError::Validation("selected project folder path is not valid UTF-8".to_owned())
    })?;

    Ok(UpsertBuddyProjectRequest { root, name: None })
}

#[tauri::command]
pub fn get_buddy_codex_runtime_status() -> CodexRuntimeStatus {
    codex::detect_codex_runtime_status()
}

#[tauri::command]
pub async fn get_buddy_runtime_diagnostics() -> BuddyRuntimeDiagnostics {
    match tauri::async_runtime::spawn_blocking(runtime_diagnostics::detect_runtime_diagnostics)
        .await
    {
        Ok(diagnostics) => diagnostics,
        Err(error) => runtime_diagnostics::create_unavailable_runtime_diagnostics(format!(
            "runtime diagnostics worker failed: {error}",
        )),
    }
}

#[tauri::command]
pub fn list_buddy_codex_prompt_context_options(
    state: State<'_, BuddyAppState>,
    request: ListBuddyCodexPromptContextOptionsRequest,
) -> BuddyCommandResult<codex::CodexPromptContextOptions> {
    let (runtime_cwd, _) = resolve_runtime_cwd(state.inner(), request.cwd)?;

    Ok(codex::load_codex_prompt_context_options(
        &runtime_cwd,
        request.file_query.as_deref(),
    )?)
}

#[tauri::command]
pub fn list_buddy_runtime_model_options() -> BuddyCommandResult<Vec<codex::CodexModelOption>> {
    Ok(codex::load_codex_model_options()?)
}

#[tauri::command]
pub fn get_buddy_run_diagnostics(
    state: State<'_, BuddyAppState>,
    run_id: String,
) -> BuddyCommandResult<BuddyRunDiagnostics> {
    let key = context_pack::context_pack_diagnostics_key(&run_id);
    let setting = state.read_setting_json(&key)?;

    Ok(create_buddy_run_diagnostics_summary(&run_id, setting))
}

#[tauri::command]
pub fn get_buddy_claude_runtime_status() -> ClaudeRuntimeStatus {
    claude::detect_claude_runtime_status()
}

#[tauri::command]
pub async fn get_buddy_usage_snapshot() -> BuddyUsageSnapshot {
    match tauri::async_runtime::spawn_blocking(usage::load_buddy_usage_snapshot).await {
        Ok(snapshot) => snapshot,
        Err(error) => usage::create_unavailable_usage_snapshot(format!(
            "usage snapshot worker failed: {error}",
        )),
    }
}

fn create_buddy_run_diagnostics_summary(
    run_id: &str,
    setting: Option<BuddySetting>,
) -> BuddyRunDiagnostics {
    let key = context_pack::context_pack_diagnostics_key(run_id);
    let Some(setting) = setting else {
        return BuddyRunDiagnostics {
            context_pack: BuddyContextPackDiagnostics {
                available: false,
                injected: false,
                key,
                not_modified: false,
                pack_hash_prefix: None,
                source_count: 0,
                updated_at: None,
            },
            run_id: run_id.to_owned(),
        };
    };

    let pack_hash_prefix = setting
        .value
        .get("packHash")
        .and_then(serde_json::Value::as_str)
        .map(|hash| hash.chars().take(8).collect::<String>());
    let source_count = setting
        .value
        .get("sourceCount")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .or_else(|| {
            setting
                .value
                .get("retrievedMemory")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len)
        })
        .or_else(|| {
            setting
                .value
                .get("sourceMemoryIds")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len)
        })
        .unwrap_or(0);

    BuddyRunDiagnostics {
        context_pack: BuddyContextPackDiagnostics {
            available: true,
            injected: setting
                .value
                .get("injected")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            key: setting.key,
            not_modified: setting
                .value
                .get("notModified")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            pack_hash_prefix,
            source_count,
            updated_at: Some(setting.updated_at),
        },
        run_id: run_id.to_owned(),
    }
}

#[tauri::command]
pub async fn get_buddy_local_state_status(
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<BuddyLocalStateStatus> {
    let state = state.inner().clone();
    run_buddy_blocking("get_buddy_local_state_status", move || {
        state.local_state_status()
    })
    .await
}

#[tauri::command]
pub async fn read_buddy_setting_json(
    state: State<'_, BuddyAppState>,
    key: String,
) -> BuddyCommandResult<Option<BuddySetting>> {
    let storage = state.storage_handle();
    run_buddy_blocking("read_buddy_setting_json", move || {
        storage.read_setting_json(&key)
    })
    .await
}

#[tauri::command]
pub async fn write_buddy_setting_json(
    state: State<'_, BuddyAppState>,
    key: String,
    value: serde_json::Value,
) -> BuddyCommandResult<BuddySetting> {
    let storage = state.storage_handle();
    run_buddy_blocking("write_buddy_setting_json", move || {
        storage.write_setting_json(&key, value)
    })
    .await
}

#[tauri::command]
pub fn authorize_buddy_project_from_folder_picker(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<Option<BuddyProject>> {
    let Some(request) = pick_buddy_project_folder(&app)? else {
        return Ok(None);
    };

    Ok(Some(state.upsert_project(request)?))
}

#[tauri::command]
pub async fn list_buddy_projects(
    state: State<'_, BuddyAppState>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyProject>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_projects", move || {
        storage.list_projects(limit.unwrap_or(200))
    })
    .await
}

#[tauri::command]
pub fn create_buddy_session(
    state: State<'_, BuddyAppState>,
    request: CreateBuddySessionRequest,
) -> BuddyCommandResult<BuddySession> {
    Ok(state.create_session(request)?)
}

#[tauri::command]
pub async fn list_buddy_sessions(
    state: State<'_, BuddyAppState>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddySession>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_sessions", move || {
        storage.list_sessions(limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_conversations(
    state: State<'_, BuddyAppState>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyConversation>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_conversations", move || {
        storage.list_conversations(limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub fn delete_buddy_session(
    state: State<'_, BuddyAppState>,
    session_id: String,
) -> BuddyCommandResult<bool> {
    Ok(state.delete_session(session_id)?)
}

#[tauri::command]
pub fn delete_buddy_conversation(
    state: State<'_, BuddyAppState>,
    conversation_id: String,
) -> BuddyCommandResult<bool> {
    Ok(state
        .storage_handle()
        .delete_conversation(conversation_id)?)
}

#[tauri::command]
pub fn create_buddy_message(
    state: State<'_, BuddyAppState>,
    request: CreateBuddyMessageRequest,
) -> BuddyCommandResult<BuddyMessage> {
    Ok(state.create_message(request)?)
}

#[tauri::command]
pub async fn list_buddy_messages(
    state: State<'_, BuddyAppState>,
    session_id: String,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyMessage>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_messages", move || {
        storage.list_messages(session_id, limit.unwrap_or(100))
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_conversation_messages(
    state: State<'_, BuddyAppState>,
    conversation_id: String,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyMessage>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_conversation_messages", move || {
        storage.list_active_conversation_messages(conversation_id, limit.unwrap_or(100))
    })
    .await
}

#[tauri::command]
pub fn cancel_buddy_chat_run(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
    cancellations: State<'_, BuddyRunCancellationRegistry>,
    run_id: String,
) -> BuddyCommandResult<BuddyRun> {
    cancellations.cancel(&run_id);

    let finished_run = record_codex_run_cancelled(&state.storage_handle(), &run_id, None, "codex")?;
    BuddyRunStateEventPublisher::new(app).emit_finished_run(&finished_run);

    Ok(finished_run.run)
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn read_json_string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn resolve_runtime_cwd(
    state: &BuddyAppState,
    requested_cwd: Option<String>,
) -> Result<(String, Option<String>), BuddyError> {
    let requested_cwd = requested_cwd
        .as_deref()
        .map(str::trim)
        .filter(|cwd| !cwd.is_empty());
    if let Some(requested_cwd) = requested_cwd {
        let project = state
            .find_project(requested_cwd)?
            .ok_or_else(|| BuddyError::Validation("project is not authorized yet".to_owned()))?;

        return Ok((project.root.clone(), Some(project.root)));
    }

    Ok((state.global_runtime_cwd(), None))
}
