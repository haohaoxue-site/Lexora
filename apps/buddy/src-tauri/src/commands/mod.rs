use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
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
    domain::{
        BuddyApprovalStatus, BuddyMessageRole, BuddyMessageVersionStatus, BuddyRunEventType,
        BuddyRunStatus, BuddyRuntime, BuddyRuntimeProtocol,
    },
    error::{BuddyError, BuddyResult},
    intent::{self, BuddyIntentClassificationInput, BuddyIntentDecision},
    memory,
    native_pet::NativePetSidecarProcess,
    state::{BuddyAppState, BuddyLocalStateStatus},
    storage::{
        AppendBuddyConversationMessageRequest, BuddyApproval, BuddyChatRunEvent, BuddyConversation,
        BuddyFinishedRun, BuddyMessage, BuddyMessageAttachment, BuddyProject,
        BuddyRegisteredAttachment, BuddyResolvedCodexAppServerRequestApproval, BuddyRun,
        BuddyRunEvent, BuddyRunEventCount, BuddyRunEventSummary, BuddySession, BuddySetting,
        BuddyStorage, CreateBuddyApprovalRequest, CreateBuddyConversationRequest,
        CreateBuddyConversationRunRequest, CreateBuddyMemoryCandidateRequest,
        CreateBuddyMessageRequest, CreateBuddyRegisteredAttachmentRequest,
        CreateBuddyRunEventRequest, CreateBuddySessionRequest, UpsertBuddyProjectRequest,
        CODEX_APP_SERVER_REQUEST_APPROVAL_KIND,
    },
};

type BuddyCommandResult<T> = Result<T, BuddyCommandError>;

const BUDDY_ANIMATION_INTENT_START_TAG: &str = "<lexora_buddy_animation_intent>";
const BUDDY_ANIMATION_INTENT_END_TAG: &str = "</lexora_buddy_animation_intent>";
const CODEX_APP_SERVER_APPROVAL_POLL_INTERVAL_MS: u64 = 250;
const CODEX_APP_SERVER_APPROVAL_WAIT_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const BUDDY_CLIPBOARD_FILE_COUNT_LIMIT: usize = 16;
const BUDDY_CLIPBOARD_FILE_MAX_BYTES: u64 = 8 * 1024 * 1024;
const CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED: &str = "auto_denied";
const CODEX_APPROVAL_SCOPE_DECISION_REQUIRES_USER_REVIEW: &str = "requires_user_review";
const CODEX_APPROVAL_SCOPE_STATUS_AUTHORIZED: &str = "authorized";
const CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH: &str = "invalid_path";
const CODEX_APPROVAL_SCOPE_STATUS_OUTSIDE_AUTHORIZED_PROJECT: &str = "outside_authorized_project";
const CODEX_APPROVAL_SCOPE_STATUS_UNSUPPORTED_REQUEST: &str = "unsupported_request";
const BUDDY_RUN_STATE_CHANGED_EVENT: &str = "buddy-run-state-changed";
const BUDDY_AGENT_TURN_INTENT: &str = "buddy.agent.turn";

#[derive(Clone, Default)]
pub struct BuddyRunCancellationRegistry {
    tokens: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl BuddyRunCancellationRegistry {
    fn register(&self, run_id: &str) -> BuddyRunCancellationToken {
        let token = Arc::new(AtomicBool::new(false));
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.insert(run_id.to_owned(), Arc::clone(&token));
        }

        token
    }

    fn cancel(&self, run_id: &str) -> bool {
        let Some(token) = self.token(run_id) else {
            return false;
        };

        token.store(true, Ordering::SeqCst);
        true
    }

    fn remove(&self, run_id: &str) {
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.remove(run_id);
        }
    }

    fn token(&self, run_id: &str) -> Option<BuddyRunCancellationToken> {
        self.tokens
            .lock()
            .ok()
            .and_then(|tokens| tokens.get(run_id).cloned())
    }
}

type BuddyRunCancellationToken = Arc<AtomicBool>;

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

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuddyRunStateChangedEvent {
    run_id: String,
    session_id: Option<String>,
    event_id: Option<i64>,
    event_type: Option<String>,
    status: Option<String>,
}

#[derive(Clone)]
struct BuddyRunStateEventPublisher {
    app: Option<AppHandle>,
}

impl BuddyRunStateEventPublisher {
    fn new(app: AppHandle) -> Self {
        Self { app: Some(app) }
    }

    fn disabled() -> Self {
        Self { app: None }
    }

    fn emit_event(&self, event: &BuddyRunEvent, session_id: Option<&str>) {
        self.emit(create_buddy_run_state_changed_event_from_event(
            event, session_id, None,
        ));
    }

    fn emit_events(&self, events: &[BuddyRunEvent], session_id: Option<&str>) {
        for event in events {
            self.emit_event(event, session_id);
        }
    }

    fn emit_run(&self, run: &BuddyRun) {
        self.emit(create_buddy_run_state_changed_event_from_run(run));
    }

    fn emit_finished_run(&self, finished_run: &BuddyFinishedRun) {
        self.emit(create_buddy_run_state_changed_event_from_event(
            &finished_run.event,
            finished_run.run.session_id.as_deref(),
            Some(&finished_run.run.status),
        ));
        self.emit_run(&finished_run.run);
    }

    fn emit(&self, payload: BuddyRunStateChangedEvent) {
        if let Some(app) = &self.app {
            let _ = app.emit(BUDDY_RUN_STATE_CHANGED_EVENT, payload);
        }
    }
}

fn create_buddy_run_state_changed_event_from_event(
    event: &BuddyRunEvent,
    session_id: Option<&str>,
    status: Option<&str>,
) -> BuddyRunStateChangedEvent {
    BuddyRunStateChangedEvent {
        run_id: event.run_id.clone(),
        session_id: session_id.map(str::to_owned),
        event_id: Some(event.id),
        event_type: Some(event.event_type.clone()),
        status: status.map(str::to_owned),
    }
}

fn create_buddy_run_state_changed_event_from_run(run: &BuddyRun) -> BuddyRunStateChangedEvent {
    BuddyRunStateChangedEvent {
        run_id: run.id.clone(),
        session_id: run.session_id.clone(),
        event_id: None,
        event_type: None,
        status: Some(run.status.clone()),
    }
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyClipboardImage {
    attachment_id: Option<String>,
    data_url: Option<String>,
    mime_type: &'static str,
    name: &'static str,
    preview_path: Option<String>,
    size_bytes: usize,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyClipboardFile {
    attachment_id: Option<String>,
    kind: String,
    name: String,
    mime_type: String,
    size_bytes: u64,
    data_url: Option<String>,
    preview_path: Option<String>,
    text: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBuddyAgentTurnRequest {
    pub(crate) conversation_id: Option<String>,
    pub(crate) conversation_seed: Option<CreateBuddyConversationRequest>,
    pub(crate) content: String,
    pub(crate) cwd: Option<String>,
    pub(crate) model_selection: Option<BuddyChatModelSelection>,
    #[serde(default)]
    pub(crate) attachments: Vec<BuddyChatAttachment>,
    #[serde(default)]
    pub(crate) context_items: Vec<BuddyChatPromptContextItem>,
    #[serde(default)]
    pub(crate) inputs: Vec<codex::CodexUserInput>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBuddyCodexPromptContextOptionsRequest {
    cwd: Option<String>,
    file_query: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuddyChatModelSelection {
    pub(crate) runtime: String,
    pub(crate) model: Option<String>,
    pub(crate) service_tier: Option<String>,
    pub(crate) effort: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuddyChatAttachment {
    attachment_id: Option<String>,
    kind: String,
    name: String,
    mime_type: String,
    size_bytes: u64,
    data_url: Option<String>,
    preview_path: Option<String>,
    text: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuddyChatPromptContextItem {
    kind: String,
    label: String,
    value: String,
    path: Option<String>,
    description: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyChatTurn {
    pub(crate) user_message: BuddyMessage,
    pub(crate) assistant_message: BuddyMessage,
    pub(crate) run: BuddyRun,
    pub(crate) events: Vec<BuddyRunEvent>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyAgentTurnStart {
    assistant_message: Option<BuddyMessage>,
    conversation: BuddyConversation,
    intent: String,
    user_message: BuddyMessage,
    run: Option<BuddyRun>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyReadOnlyTaskApprovalTurn {
    approval: BuddyApproval,
    user_message: BuddyMessage,
    assistant_message: BuddyMessage,
    run: BuddyRun,
    events: Vec<BuddyRunEvent>,
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
pub fn read_buddy_clipboard_image(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<Option<BuddyClipboardImage>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(read_buddy_clipboard_png_bytes_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    let Some(png_bytes) = receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive clipboard image".to_owned()))?
        .map_err(BuddyCommandError::from)?
    else {
        return Ok(None);
    };

    create_buddy_clipboard_image_from_png_bytes(state.inner(), &png_bytes)
        .map(Some)
        .map_err(Into::into)
}

#[tauri::command]
pub fn read_buddy_clipboard_files(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
    paths: Vec<String>,
) -> BuddyCommandResult<Vec<BuddyClipboardFile>> {
    if !paths.is_empty() {
        return Err(BuddyError::Validation(
            "clipboard file paths must come from the native clipboard".to_owned(),
        )
        .into());
    }

    let paths = read_buddy_clipboard_file_paths(&app)?;

    create_buddy_clipboard_files_from_paths(state.inner(), &paths, "clipboard-file")
        .map_err(Into::into)
}

#[tauri::command]
pub fn select_buddy_chat_attachment_files(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<Vec<BuddyClipboardFile>> {
    let paths = pick_buddy_chat_attachment_file_paths(&app)?;

    create_buddy_clipboard_files_from_paths(state.inner(), &paths, "file-picker")
        .map_err(Into::into)
}

#[tauri::command]
pub fn set_buddy_native_pet_animation(
    pet_process: State<'_, NativePetSidecarProcess>,
    animation: String,
) -> BuddyCommandResult<()> {
    Ok(pet_process.set_animation(&animation)?)
}

fn buddy_current_window_frame_state(window: &Window) -> BuddyCommandResult<BuddyWindowFrameState> {
    Ok(BuddyWindowFrameState {
        is_maximized: window
            .is_maximized()
            .map_err(|error| BuddyError::Runtime(error.to_string()))?,
        is_always_on_top: desktop_shell::window_is_always_on_top(window)?,
    })
}

fn read_buddy_clipboard_png_bytes_on_main_thread() -> BuddyResult<Option<Vec<u8>>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let Some(pixbuf) = clipboard.wait_for_image() else {
        return Ok(None);
    };

    let png_bytes = pixbuf.save_to_bufferv("png", &[]).map_err(|error| {
        BuddyError::Runtime(format!("failed to encode clipboard image: {error}"))
    })?;

    Ok(Some(png_bytes))
}

fn read_buddy_clipboard_file_paths(app: &AppHandle) -> BuddyResult<Vec<PathBuf>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(read_buddy_clipboard_file_paths_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive clipboard file paths".to_owned()))?
}

fn read_buddy_clipboard_file_paths_on_main_thread() -> BuddyResult<Vec<PathBuf>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let mut paths = Vec::new();
    for uri in clipboard.wait_for_uris() {
        push_unique_buddy_clipboard_file_path(&mut paths, uri.as_str());
    }

    if paths.is_empty() {
        if let Some(text) = clipboard.wait_for_text() {
            for line in text.lines() {
                push_unique_buddy_clipboard_file_path(&mut paths, line);
            }
        }
    }

    Ok(paths)
}

fn create_buddy_clipboard_image_from_png_bytes(
    state: &BuddyAppState,
    png_bytes: &[u8],
) -> BuddyResult<BuddyClipboardImage> {
    let name = "clipboard-image.png";
    let attachment = create_buddy_registered_attachment_from_bytes(
        state,
        name,
        "image/png",
        "image",
        "clipboard-image",
        png_bytes,
    )?;

    Ok(BuddyClipboardImage {
        attachment_id: Some(attachment.id),
        data_url: None,
        mime_type: "image/png",
        name,
        preview_path: Some(attachment.path),
        size_bytes: png_bytes.len(),
    })
}

fn create_buddy_clipboard_files_from_paths(
    state: &BuddyAppState,
    paths: &[PathBuf],
    source: &'static str,
) -> BuddyResult<Vec<BuddyClipboardFile>> {
    let mut files = Vec::new();
    for path in paths.iter().take(BUDDY_CLIPBOARD_FILE_COUNT_LIMIT) {
        if let Some(file) = create_buddy_clipboard_file_from_path(state, path, source)? {
            files.push(file);
        }
    }

    Ok(files)
}

fn create_buddy_clipboard_file_from_path(
    state: &BuddyAppState,
    path: &Path,
    source: &'static str,
) -> BuddyResult<Option<BuddyClipboardFile>> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return Ok(None),
        Err(error) => return Err(BuddyError::Io(error)),
    };
    if metadata.len() > BUDDY_CLIPBOARD_FILE_MAX_BYTES {
        return Err(BuddyError::Validation(format!(
            "clipboard file is too large: {} bytes",
            metadata.len()
        )));
    }

    let mime_type = guess_buddy_clipboard_file_mime_type(path);
    let kind = if mime_type.starts_with("image/") {
        "image"
    } else {
        let is_text_candidate = is_buddy_text_clipboard_file(path, &mime_type);
        let text_bytes = is_text_candidate.then(|| fs::read(path)).transpose()?;
        if text_bytes
            .as_ref()
            .is_some_and(|bytes| std::str::from_utf8(bytes).is_ok())
        {
            "text"
        } else {
            "binary"
        }
    };
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| BuddyError::Validation("clipboard file name is not valid UTF-8".to_owned()))?
        .to_owned();
    let attachment = create_buddy_registered_attachment_from_path(
        state,
        path,
        &name,
        &mime_type,
        kind,
        source,
        metadata.len(),
    )?;
    let preview_path = (kind == "image").then(|| attachment.path.clone());

    Ok(Some(BuddyClipboardFile {
        attachment_id: Some(attachment.id),
        kind: kind.to_owned(),
        name,
        mime_type,
        size_bytes: metadata.len(),
        data_url: None,
        preview_path,
        text: None,
    }))
}

fn create_buddy_registered_attachment_from_bytes(
    state: &BuddyAppState,
    name: &str,
    mime_type: &str,
    kind: &str,
    source: &str,
    bytes: &[u8],
) -> BuddyResult<BuddyRegisteredAttachment> {
    let attachment_id = uuid::Uuid::new_v4().to_string();
    let path = resolve_buddy_registered_attachment_path(
        &state.attachments_dir_path(),
        &attachment_id,
        name,
    )?;
    fs::write(&path, bytes)?;

    state.create_attachment(CreateBuddyRegisteredAttachmentRequest {
        id: attachment_id,
        kind: kind.to_owned(),
        mime_type: mime_type.to_owned(),
        name: name.to_owned(),
        path: path.to_string_lossy().into_owned(),
        size_bytes: bytes.len() as u64,
        source: source.to_owned(),
    })
}

fn create_buddy_registered_attachment_from_path(
    state: &BuddyAppState,
    source_path: &Path,
    name: &str,
    mime_type: &str,
    kind: &str,
    source: &str,
    size_bytes: u64,
) -> BuddyResult<BuddyRegisteredAttachment> {
    let attachment_id = uuid::Uuid::new_v4().to_string();
    let path = resolve_buddy_registered_attachment_path(
        &state.attachments_dir_path(),
        &attachment_id,
        name,
    )?;
    fs::copy(source_path, &path)?;

    state.create_attachment(CreateBuddyRegisteredAttachmentRequest {
        id: attachment_id,
        kind: kind.to_owned(),
        mime_type: mime_type.to_owned(),
        name: name.to_owned(),
        path: path.to_string_lossy().into_owned(),
        size_bytes,
        source: source.to_owned(),
    })
}

fn resolve_buddy_registered_attachment_path(
    attachments_dir: &Path,
    attachment_id: &str,
    name: &str,
) -> BuddyResult<PathBuf> {
    fs::create_dir_all(attachments_dir)?;
    Ok(attachments_dir.join(format!(
        "{}-{}",
        attachment_id,
        sanitize_buddy_attachment_file_name(name)
    )))
}

fn sanitize_buddy_attachment_file_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|character| match character {
            '/' | '\\' | '\0' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect::<String>();
    let sanitized =
        sanitized.trim_matches(|character: char| character.is_whitespace() || character == '.');

    if sanitized.is_empty() {
        "attachment".to_owned()
    } else {
        sanitized.to_owned()
    }
}

fn pick_buddy_chat_attachment_file_paths(app: &AppHandle) -> BuddyCommandResult<Vec<PathBuf>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(pick_buddy_chat_attachment_file_paths_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive attachment file selection".to_owned()))?
        .map_err(Into::into)
}

fn pick_buddy_chat_attachment_file_paths_on_main_thread() -> BuddyResult<Vec<PathBuf>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    use gtk::prelude::{FileChooserExt, NativeDialogExt};

    let dialog = gtk::FileChooserNative::new(
        Some("选择附件"),
        gtk::Window::NONE,
        gtk::FileChooserAction::Open,
        Some("选择"),
        Some("取消"),
    );
    dialog.set_select_multiple(true);
    let response = dialog.run();
    let paths = if response == gtk::ResponseType::Accept {
        dialog.filenames()
    } else {
        Vec::new()
    };
    dialog.destroy();

    Ok(paths)
}

fn parse_buddy_clipboard_file_uri(reference: &str) -> Option<PathBuf> {
    let reference = reference.trim();
    if reference.is_empty()
        || reference.starts_with('#')
        || reference == "copy"
        || reference == "cut"
    {
        return None;
    }

    if reference.starts_with('/') {
        return Some(PathBuf::from(reference));
    }

    if !reference.starts_with("file://") {
        return None;
    }

    let (path, hostname) = glib::filename_from_uri(reference).ok()?;
    if hostname
        .as_ref()
        .is_some_and(|hostname| !hostname.is_empty() && hostname.as_str() != "localhost")
    {
        return None;
    }

    Some(path)
}

fn push_unique_buddy_clipboard_file_path(paths: &mut Vec<PathBuf>, reference: &str) {
    let Some(path) = parse_buddy_clipboard_file_uri(reference) else {
        return;
    };
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn guess_buddy_clipboard_file_mime_type(path: &Path) -> String {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "txt" => "text/plain",
        "md" | "mdx" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" => "text/html",
        "css" => "text/css",
        "scss" => "text/x-scss",
        "ts" | "tsx" | "js" | "jsx" | "vue" | "rs" | "toml" | "yaml" | "yml" => "text/plain",
        _ => "application/octet-stream",
    }
    .to_owned()
}

fn is_buddy_text_clipboard_file(path: &Path, mime_type: &str) -> bool {
    mime_type.starts_with("text/")
        || matches!(mime_type, "application/json" | "application/xml")
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "md" | "mdx"
                        | "txt"
                        | "csv"
                        | "ts"
                        | "tsx"
                        | "js"
                        | "jsx"
                        | "json"
                        | "vue"
                        | "rs"
                        | "toml"
                        | "yaml"
                        | "yml"
                        | "xml"
                        | "html"
                        | "css"
                        | "scss"
                )
            })
            .unwrap_or(false)
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
        .map(|value| value as usize)
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
pub fn start_buddy_agent_turn(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
    cancellations: State<'_, BuddyRunCancellationRegistry>,
    request: StartBuddyAgentTurnRequest,
) -> BuddyCommandResult<BuddyAgentTurnStart> {
    let plan = create_buddy_agent_turn_plan(state.inner(), request)?;
    let storage = state.storage_handle();
    let memory_root = state.memories_dir_path();
    let assistant_message = plan.assistant_message.clone();
    let conversation = plan.conversation.clone();
    let intent = plan.decision.intent.as_str().to_owned();
    let intent_decision = plan.decision.clone();
    let run = plan.run.clone();
    let user_message = plan.user_message.clone();

    if let Some(run_to_execute) = plan.run {
        let user_message_id = user_message.id.clone();
        let cancellation = cancellations.register(&run_to_execute.id);
        let run_id = run_to_execute.id.clone();
        let cancellations = cancellations.inner().clone();
        let event_publisher = BuddyRunStateEventPublisher::new(app);

        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) =
                execute_existing_codex_read_only_run(ExistingCodexReadOnlyRunRequest {
                    approval_id: None,
                    attachment_count: plan.attachment_count,
                    runtime_cwd: plan.runtime_cwd,
                    content: plan.runtime_content,
                    input: plan.runtime_inputs,
                    intent_decision,
                    memory_root,
                    model_selection: plan.model_selection,
                    run: run_to_execute,
                    selected_context: plan.selected_context,
                    target: BuddyCodexRunTarget::conversation(
                        plan.conversation.id,
                        plan.conversation.active_branch_id,
                        plan.user_message.id,
                    ),
                    source_project: plan.source_project,
                    storage,
                    cancellation: Some(cancellation),
                    event_publisher,
                    user_message_id,
                })
            {
                eprintln!("lexora buddy agent turn failed: {error}");
            }
            cancellations.remove(&run_id);
        });
    }

    Ok(BuddyAgentTurnStart {
        assistant_message,
        conversation,
        intent,
        run,
        user_message,
    })
}

pub(crate) fn run_buddy_agent_turn(
    state: &BuddyAppState,
    request: StartBuddyAgentTurnRequest,
) -> Result<BuddyChatTurn, BuddyError> {
    let plan = create_buddy_agent_turn_plan(state, request)?;
    let run = plan.run.ok_or_else(|| {
        BuddyError::Validation("agent turn did not require a runtime run".to_owned())
    })?;
    let conversation_id = plan.conversation.id.clone();
    let branch_id = plan.conversation.active_branch_id.clone();
    let user_message_id = plan.user_message.id.clone();
    let storage = state.storage_handle();
    let execution = execute_existing_codex_read_only_run(ExistingCodexReadOnlyRunRequest {
        approval_id: None,
        attachment_count: plan.attachment_count,
        runtime_cwd: plan.runtime_cwd,
        content: plan.runtime_content,
        input: plan.runtime_inputs,
        intent_decision: plan.decision,
        memory_root: state.memories_dir_path(),
        model_selection: plan.model_selection,
        run,
        selected_context: plan.selected_context,
        target: BuddyCodexRunTarget::conversation(
            conversation_id,
            branch_id,
            user_message_id.clone(),
        ),
        source_project: plan.source_project,
        storage,
        cancellation: None,
        event_publisher: BuddyRunStateEventPublisher::disabled(),
        user_message_id,
    })?;

    Ok(BuddyChatTurn {
        assistant_message: execution.assistant_message,
        events: execution.events,
        run: execution.run,
        user_message: plan.user_message,
    })
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

struct BuddyAgentTurnPlan {
    attachment_count: usize,
    assistant_message: Option<BuddyMessage>,
    runtime_content: String,
    runtime_cwd: String,
    runtime_inputs: Vec<codex::CodexUserInput>,
    conversation: BuddyConversation,
    decision: BuddyIntentDecision,
    model_selection: Option<codex::CodexModelSelection>,
    run: Option<BuddyRun>,
    selected_context: Vec<context_pack::BuddyContextPackSelectedContextItem>,
    source_project: Option<String>,
    user_message: BuddyMessage,
}

fn create_buddy_agent_turn_plan(
    state: &BuddyAppState,
    request: StartBuddyAgentTurnRequest,
) -> Result<BuddyAgentTurnPlan, BuddyError> {
    let content = request.content.trim().to_owned();
    let attachments = materialize_buddy_chat_attachments(state, request.attachments)?;
    let context_items = request.context_items;
    let selected_context = create_context_pack_selected_context_items(&context_items);
    let inputs = request.inputs;
    let model_selection = create_codex_model_selection(request.model_selection);
    if content.is_empty() && attachments.is_empty() && inputs.is_empty() {
        return Err(BuddyError::Codex("message content is empty".to_owned()));
    }

    let conversation = resolve_agent_turn_conversation(
        state,
        normalize_optional_string(request.conversation_id),
        request.conversation_seed,
    )?;
    let (runtime_cwd, source_project) =
        resolve_agent_turn_runtime_cwd(state, &conversation, request.cwd.clone())?;
    let decision = intent::classify_buddy_intent(BuddyIntentClassificationInput {
        content: &content,
        cwd: Some(runtime_cwd.as_str()),
        has_attachments: !attachments.is_empty(),
        has_context_items: !context_items.is_empty(),
        has_project_scope: conversation.project_root.is_some() || source_project.is_some(),
        has_structured_inputs: !inputs.is_empty(),
    });
    let user_content =
        compose_buddy_chat_user_message_content(&content, &attachments, &context_items);
    let user_message =
        state.append_conversation_message(AppendBuddyConversationMessageRequest {
            attachments: create_buddy_message_attachments(&attachments),
            branch_id: conversation.active_branch_id.clone(),
            content: user_content,
            conversation_id: conversation.id.clone(),
            parent_message_id: None,
            role: BuddyMessageRole::User.as_str().to_owned(),
            run_id: None,
            version_group_id: None,
            version_index: 1,
            version_status: BuddyMessageVersionStatus::Active.as_str().to_owned(),
        })?;
    let router_decision_payload =
        create_router_decision_event_payload(&decision, &conversation, &user_message);
    state.storage_handle().append_conversation_event(
        conversation.id.clone(),
        BuddyRunEventType::RouterDecision.as_str().to_owned(),
        router_decision_payload.clone(),
    )?;
    if !decision.requires_runtime {
        let assistant_message =
            state.append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: create_local_buddy_reply(decision.intent, &content),
                conversation_id: conversation.id.clone(),
                parent_message_id: Some(user_message.id.clone()),
                role: BuddyMessageRole::Assistant.as_str().to_owned(),
                run_id: None,
                version_group_id: None,
                version_index: 1,
                version_status: BuddyMessageVersionStatus::Active.as_str().to_owned(),
            })?;

        return Ok(BuddyAgentTurnPlan {
            attachment_count: attachments.len(),
            assistant_message: Some(assistant_message),
            runtime_content: String::new(),
            runtime_cwd,
            runtime_inputs: Vec::new(),
            conversation,
            decision,
            model_selection,
            run: None,
            selected_context,
            source_project,
            user_message,
        });
    }

    let runtime_content =
        compose_buddy_chat_runtime_content(&content, &attachments, &context_items);
    let builtin_animation_skill =
        create_buddy_builtin_animation_skill_input(Path::new(&state.global_runtime_cwd()))?;
    let runtime_inputs = compose_buddy_chat_codex_inputs(
        &runtime_content,
        inputs,
        &attachments,
        Some(builtin_animation_skill),
    )?;
    let attachment_count = attachments.len();
    let external_thread_id = state
        .storage_handle()
        .find_conversation_runtime_binding(
            conversation.id.clone(),
            conversation.active_branch_id.clone(),
            BuddyRuntime::Codex.as_str().to_owned(),
            Some(runtime_cwd.clone()),
        )?
        .and_then(|binding| binding.external_thread_id);
    let run = state.create_conversation_run(CreateBuddyConversationRunRequest {
        runtime: BuddyRuntime::Codex.as_str().to_owned(),
        branch_id: conversation.active_branch_id.clone(),
        conversation_id: conversation.id.clone(),
        cwd: Some(runtime_cwd.clone()),
        external_run_id: None,
        external_thread_id,
        intent: BUDDY_AGENT_TURN_INTENT.to_owned(),
        triggering_message_id: user_message.id.clone(),
    })?;
    state
        .storage_handle()
        .append_run_event(CreateBuddyRunEventRequest {
            event_type: BuddyRunEventType::RouterDecision.as_str().to_owned(),
            payload: router_decision_payload,
            run_id: run.id.clone(),
        })?;

    Ok(BuddyAgentTurnPlan {
        attachment_count,
        assistant_message: None,
        runtime_content,
        runtime_cwd,
        runtime_inputs,
        conversation,
        decision,
        model_selection,
        run: Some(run),
        selected_context,
        source_project,
        user_message,
    })
}

fn create_context_pack_selected_context_items(
    context_items: &[BuddyChatPromptContextItem],
) -> Vec<context_pack::BuddyContextPackSelectedContextItem> {
    context_items
        .iter()
        .map(|item| context_pack::BuddyContextPackSelectedContextItem {
            description: item.description.clone(),
            kind: item.kind.clone(),
            label: item.label.clone(),
            path: item.path.clone(),
        })
        .collect()
}

fn create_router_decision_event_payload(
    decision: &BuddyIntentDecision,
    conversation: &BuddyConversation,
    user_message: &BuddyMessage,
) -> serde_json::Value {
    serde_json::json!({
        "runtime": decision.runtime.as_deref(),
        "branchId": conversation.active_branch_id.as_str(),
        "conversationId": conversation.id.as_str(),
        "cwd": decision.cwd.as_deref(),
        "intent": decision.intent.as_str(),
        "memoryEligibility": {
            "candidateGeneration": decision.memory_eligibility.candidate_generation,
            "durableWrite": decision.memory_eligibility.durable_write,
            "reasons": decision.memory_eligibility.reasons,
            "retrieval": decision.memory_eligibility.retrieval,
        },
        "memoryPolicy": decision.memory_policy.as_str(),
        "reason": decision.reason.as_str(),
        "requiresRuntime": decision.requires_runtime,
        "userMessageId": user_message.id.as_str(),
    })
}

fn create_local_buddy_reply(intent: intent::BuddyChatIntent, content: &str) -> String {
    match intent {
        intent::BuddyChatIntent::CompanionChat => create_companion_chat_reply(content),
        intent::BuddyChatIntent::DirectAnswer => create_direct_answer_reply(),
        _ => "我在。".to_owned(),
    }
}

fn create_companion_chat_reply(content: &str) -> String {
    let normalized = content.trim().trim_matches(|ch: char| {
        ch.is_whitespace()
            || matches!(
                ch,
                '。' | '！' | '？' | '，' | '.' | '!' | '?' | ',' | '~' | '～'
            )
    });
    match normalized {
        "谢谢" | "谢了" | "多谢" | "辛苦了" => "不客气，我在。".to_owned(),
        "在吗" | "你在吗" => "我在。".to_owned(),
        _ => "你好，我在。".to_owned(),
    }
}

fn create_direct_answer_reply() -> String {
    "我是 Lexora Buddy，Lexora 的本地桌面伙伴。我会在自己的会话、运行事件和记忆边界内协助你；需要项目内容时，只按已授权的 cwd 处理。".to_owned()
}

fn resolve_agent_turn_conversation(
    state: &BuddyAppState,
    conversation_id: Option<String>,
    conversation_seed: Option<CreateBuddyConversationRequest>,
) -> Result<BuddyConversation, BuddyError> {
    match (conversation_id, conversation_seed) {
        (Some(conversation_id), None) => state.find_conversation(&conversation_id),
        (None, Some(conversation_seed)) => state.create_conversation(conversation_seed),
        (Some(_), Some(_)) => Err(BuddyError::Validation(
            "conversationId and conversationSeed cannot be provided together".to_owned(),
        )),
        (None, None) => Err(BuddyError::Validation(
            "conversationId or conversationSeed is required".to_owned(),
        )),
    }
}

fn resolve_agent_turn_runtime_cwd(
    state: &BuddyAppState,
    conversation: &BuddyConversation,
    requested_cwd: Option<String>,
) -> Result<(String, Option<String>), BuddyError> {
    let Some(requested_cwd) = normalize_optional_string(requested_cwd) else {
        return match conversation.project_root.as_ref() {
            Some(project_root) => Ok((project_root.clone(), Some(project_root.clone()))),
            None => Ok((state.global_runtime_cwd(), None)),
        };
    };
    let (runtime_cwd, source_project) = resolve_runtime_cwd(state, Some(requested_cwd))?;
    validate_agent_turn_conversation_project_scope(conversation, source_project.as_deref())?;

    Ok((runtime_cwd, source_project))
}

fn validate_agent_turn_conversation_project_scope(
    conversation: &BuddyConversation,
    source_project: Option<&str>,
) -> Result<(), BuddyError> {
    match (conversation.project_root.as_deref(), source_project) {
        (Some(conversation_project), Some(source_project))
            if conversation_project == source_project =>
        {
            Ok(())
        }
        (Some(_), Some(_)) => Err(BuddyError::Validation(
            "conversation project root does not match requested cwd".to_owned(),
        )),
        (Some(_), None) => Err(BuddyError::Validation(
            "project conversation requires its project cwd".to_owned(),
        )),
        (None, Some(_)) => Err(BuddyError::Validation(
            "global conversation cannot run in a project cwd".to_owned(),
        )),
        (None, None) => Ok(()),
    }
}

fn create_codex_model_selection(
    selection: Option<BuddyChatModelSelection>,
) -> Option<codex::CodexModelSelection> {
    let selection = selection?;
    if selection.runtime != BuddyRuntime::Codex.as_str() {
        return None;
    }

    let next = codex::CodexModelSelection {
        effort: normalize_optional_string(selection.effort),
        model: normalize_optional_string(selection.model),
        service_tier: normalize_optional_string(selection.service_tier),
    };
    if next.model.is_none() && next.service_tier.is_none() && next.effort.is_none() {
        return None;
    }

    Some(next)
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

struct BuddyCodexReadOnlyExecution {
    assistant_message: BuddyMessage,
    events: Vec<BuddyRunEvent>,
    run: BuddyRun,
}

#[derive(Clone, Debug)]
struct BuddyCodexRunTarget {
    branch_id: Option<String>,
    conversation_id: Option<String>,
    session_id: Option<String>,
    triggering_message_id: Option<String>,
}

impl BuddyCodexRunTarget {
    fn session(session_id: String) -> Self {
        Self {
            branch_id: None,
            conversation_id: None,
            session_id: Some(session_id),
            triggering_message_id: None,
        }
    }

    fn conversation(
        conversation_id: String,
        branch_id: String,
        triggering_message_id: String,
    ) -> Self {
        Self {
            branch_id: Some(branch_id),
            conversation_id: Some(conversation_id),
            session_id: None,
            triggering_message_id: Some(triggering_message_id),
        }
    }

    fn context_owner_id(&self) -> Result<&str, BuddyError> {
        self.session_id
            .as_deref()
            .or(self.conversation_id.as_deref())
            .ok_or_else(|| BuddyError::Validation("codex run target is missing".to_owned()))
    }

    fn event_session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    fn upsert_codex_runtime_binding(
        &self,
        storage: &BuddyStorage,
        runtime_cwd: &str,
        external_thread_id: String,
    ) -> Result<(), BuddyError> {
        if let Some(session_id) = self.session_id.as_deref() {
            storage.upsert_runtime_binding(
                session_id.to_owned(),
                BuddyRuntime::Codex.as_str().to_owned(),
                Some(runtime_cwd.to_owned()),
                Some(external_thread_id),
                None,
            )?;

            return Ok(());
        }

        let conversation_id = self.conversation_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("codex conversation target is missing".to_owned())
        })?;
        let branch_id = self.branch_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("codex conversation branch target is missing".to_owned())
        })?;
        storage.upsert_conversation_runtime_binding(
            conversation_id.to_owned(),
            branch_id.to_owned(),
            BuddyRuntime::Codex.as_str().to_owned(),
            Some(runtime_cwd.to_owned()),
            Some(external_thread_id),
            None,
        )?;

        Ok(())
    }
}

struct ExistingCodexReadOnlyRunRequest {
    approval_id: Option<String>,
    attachment_count: usize,
    runtime_cwd: String,
    content: String,
    input: Vec<codex::CodexUserInput>,
    intent_decision: BuddyIntentDecision,
    memory_root: PathBuf,
    model_selection: Option<codex::CodexModelSelection>,
    run: BuddyRun,
    selected_context: Vec<context_pack::BuddyContextPackSelectedContextItem>,
    target: BuddyCodexRunTarget,
    source_project: Option<String>,
    storage: BuddyStorage,
    cancellation: Option<BuddyRunCancellationToken>,
    event_publisher: BuddyRunStateEventPublisher,
    user_message_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct TrustedCodexSkillInput {
    name: String,
    path: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CodexAppServerApprovalScope {
    authorization_root: String,
    cwd: String,
    decision: &'static str,
    reason: Option<&'static str>,
    status: &'static str,
    target_root: Option<String>,
}

fn record_codex_run_failure(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    message: String,
) -> Result<BuddyFinishedRun, BuddyError> {
    storage.finish_run(
        run_id.to_owned(),
        BuddyRunStatus::Failed.as_str().to_owned(),
        BuddyRunEventType::RunFailed.as_str().to_owned(),
        serde_json::json!({
            "approvalId": approval_id,
            "message": message,
            "protocol": protocol,
        }),
    )
}

fn record_codex_run_cancelled(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
) -> Result<BuddyFinishedRun, BuddyError> {
    storage.finish_run(
        run_id.to_owned(),
        BuddyRunStatus::Cancelled.as_str().to_owned(),
        BuddyRunEventType::RunCancelled.as_str().to_owned(),
        serde_json::json!({
            "approvalId": approval_id,
            "protocol": protocol,
            "reason": "user_cancelled",
        }),
    )
}

fn is_buddy_run_cancelled(cancellation: Option<&BuddyRunCancellationToken>) -> bool {
    cancellation.is_some_and(|token| token.load(Ordering::SeqCst))
}

fn abort_if_buddy_run_cancelled(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    cancellation: Option<&BuddyRunCancellationToken>,
    event_publisher: &BuddyRunStateEventPublisher,
) -> Result<(), BuddyError> {
    if !is_buddy_run_cancelled(cancellation) {
        return Ok(());
    }

    let finished_run = record_codex_run_cancelled(storage, run_id, approval_id, protocol)?;
    event_publisher.emit_finished_run(&finished_run);
    Err(BuddyError::Runtime("run cancelled".to_owned()))
}

fn wait_for_codex_app_server_approval(
    storage: &BuddyStorage,
    run_id: &str,
    runtime_cwd: &str,
    request: &codex::CodexAppServerApprovalRequest,
    cancellation: Option<&BuddyRunCancellationToken>,
) -> Result<codex::CodexAppServerApprovalDecision, BuddyError> {
    let scope = create_codex_app_server_approval_scope(runtime_cwd, request);
    let approval = storage.create_approval(CreateBuddyApprovalRequest {
        kind: CODEX_APP_SERVER_REQUEST_APPROVAL_KIND.to_owned(),
        payload: serde_json::json!({
            "authorizationRoot": scope.authorization_root,
            "runtime": BuddyRuntime::Codex.as_str(),
            "cwd": scope.cwd,
            "itemId": request.item_id.clone(),
            "method": request.method.clone(),
            "mode": "codexAppServerRequest",
            "params": request.params.clone(),
            "promptPreview": create_codex_app_server_approval_preview(request),
            "protocol": BuddyRuntimeProtocol::CodexAppServer.as_str(),
            "requestedBy": "codexAppServer",
            "requestId": request.request_id,
            "scopeDecision": scope.decision,
            "scopeReason": scope.reason,
            "scopeStatus": scope.status,
            "targetRoot": scope.target_root,
            "threadId": request.thread_id.clone(),
            "turnId": request.turn_id.clone(),
        }),
        run_id: Some(run_id.to_owned()),
    })?;
    if scope.decision == CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED {
        storage.resolve_codex_app_server_request_approval(
            approval.id.clone(),
            BuddyApprovalStatus::Denied.as_str().to_owned(),
        )?;
        return Ok(codex::CodexAppServerApprovalDecision::Decline);
    }

    let deadline =
        Instant::now() + Duration::from_millis(CODEX_APP_SERVER_APPROVAL_WAIT_TIMEOUT_MS);

    loop {
        if is_buddy_run_cancelled(cancellation) {
            let _ = storage.resolve_codex_app_server_request_approval(
                approval.id.clone(),
                BuddyApprovalStatus::Cancelled.as_str().to_owned(),
            );
            return Err(BuddyError::Runtime("run cancelled".to_owned()));
        }

        let current = storage.find_approval(approval.id.clone())?;
        match current.status.as_str() {
            status if status == BuddyApprovalStatus::Approved.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Accept);
            }
            status if status == BuddyApprovalStatus::Denied.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Decline);
            }
            status if status == BuddyApprovalStatus::Cancelled.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Cancel);
            }
            status if status == BuddyApprovalStatus::Pending.as_str() => {}
            _ => {
                return Err(BuddyError::Validation(format!(
                    "approval status is invalid: {}",
                    current.status
                )));
            }
        }

        if Instant::now() >= deadline {
            let _ = storage.resolve_codex_app_server_request_approval(
                approval.id.clone(),
                BuddyApprovalStatus::Cancelled.as_str().to_owned(),
            );
            return Ok(codex::CodexAppServerApprovalDecision::Cancel);
        }

        thread::sleep(Duration::from_millis(
            CODEX_APP_SERVER_APPROVAL_POLL_INTERVAL_MS,
        ));
    }
}

fn create_codex_app_server_approval_scope(
    runtime_cwd: &str,
    request: &codex::CodexAppServerApprovalRequest,
) -> CodexAppServerApprovalScope {
    let authorization_root_path = normalize_absolute_scope_path(runtime_cwd);
    let authorization_root = authorization_root_path
        .as_ref()
        .map(path_to_lossy_string)
        .unwrap_or_else(|| runtime_cwd.to_owned());
    let cwd_candidate =
        read_json_string_field(&request.params, "cwd").unwrap_or_else(|| runtime_cwd.to_owned());
    let cwd_path = normalize_absolute_scope_path(&cwd_candidate);
    let cwd = cwd_path
        .as_ref()
        .map(path_to_lossy_string)
        .unwrap_or(cwd_candidate);
    let target_candidate = match request.method.as_str() {
        "item/fileChange/requestApproval" => {
            read_json_string_field(&request.params, "grantRoot").unwrap_or_else(|| cwd.clone())
        }
        _ => cwd.clone(),
    };
    let target_path = normalize_absolute_scope_path(&target_candidate);
    let target_root = target_path.as_ref().map(path_to_lossy_string);

    if !is_supported_codex_app_server_approval_method(&request.method) {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request method is not supported by Buddy"),
            status: CODEX_APPROVAL_SCOPE_STATUS_UNSUPPORTED_REQUEST,
            target_root,
        };
    }

    let Some(authorization_root_path) = authorization_root_path else {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("authorized project path is invalid"),
            status: CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH,
            target_root,
        };
    };
    let (Some(cwd_path), Some(target_path)) = (cwd_path, target_path) else {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request path is invalid"),
            status: CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH,
            target_root,
        };
    };
    if !cwd_path.starts_with(&authorization_root_path)
        || !target_path.starts_with(&authorization_root_path)
    {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request path is outside the authorized project"),
            status: CODEX_APPROVAL_SCOPE_STATUS_OUTSIDE_AUTHORIZED_PROJECT,
            target_root,
        };
    }

    CodexAppServerApprovalScope {
        authorization_root,
        cwd,
        decision: CODEX_APPROVAL_SCOPE_DECISION_REQUIRES_USER_REVIEW,
        reason: None,
        status: CODEX_APPROVAL_SCOPE_STATUS_AUTHORIZED,
        target_root,
    }
}

fn is_supported_codex_app_server_approval_method(method: &str) -> bool {
    matches!(
        method,
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
    )
}

fn normalize_absolute_scope_path(path: &str) -> Option<PathBuf> {
    let path = Path::new(path.trim());
    if !path.is_absolute() {
        return None;
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(std::path::MAIN_SEPARATOR.to_string()),
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(segment) => normalized.push(segment),
        }
    }

    canonicalize_scope_path(&normalized)
}

fn canonicalize_scope_path(path: &Path) -> Option<PathBuf> {
    if path.exists() {
        return path.canonicalize().ok();
    }

    let mut ancestor = path.parent();
    while let Some(existing_ancestor) = ancestor {
        if existing_ancestor.exists() {
            let canonical_ancestor = existing_ancestor.canonicalize().ok()?;
            let suffix = path.strip_prefix(existing_ancestor).ok()?;

            return Some(canonical_ancestor.join(suffix));
        }

        ancestor = existing_ancestor.parent();
    }

    None
}

fn path_to_lossy_string(path: &PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn create_codex_app_server_approval_preview(
    request: &codex::CodexAppServerApprovalRequest,
) -> String {
    let preview = match request.method.as_str() {
        "item/commandExecution/requestApproval" => {
            read_json_string_field(&request.params, "command")
                .or_else(|| read_json_string_field(&request.params, "reason"))
                .unwrap_or_else(|| "Codex 请求执行命令".to_owned())
        }
        "item/fileChange/requestApproval" => read_json_string_field(&request.params, "reason")
            .or_else(|| {
                read_json_string_field(&request.params, "grantRoot")
                    .map(|root| format!("Codex 请求写入 {root}"))
            })
            .unwrap_or_else(|| "Codex 请求修改文件".to_owned()),
        _ => request.method.clone(),
    };

    preview.chars().take(240).collect()
}

fn read_json_string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn execute_existing_codex_read_only_run(
    request: ExistingCodexReadOnlyRunRequest,
) -> Result<BuddyCodexReadOnlyExecution, BuddyError> {
    let ExistingCodexReadOnlyRunRequest {
        approval_id,
        attachment_count,
        runtime_cwd,
        content,
        input,
        intent_decision,
        memory_root,
        model_selection,
        mut run,
        selected_context,
        target,
        source_project,
        storage,
        cancellation,
        event_publisher,
        user_message_id,
    } = request;
    let approval_id = approval_id.as_deref();

    let protocol = select_codex_runtime_protocol(&storage, &run.id, approval_id, &event_publisher)?;
    abort_if_buddy_run_cancelled(
        &storage,
        &run.id,
        approval_id,
        protocol.as_str(),
        cancellation.as_ref(),
        &event_publisher,
    )?;
    let run_context = prepare_codex_run_context(
        &storage,
        &memory_root,
        &run.id,
        &target,
        &runtime_cwd,
        &content,
        source_project.as_deref(),
        &intent_decision,
        &selected_context,
    )?;
    run = storage.update_run_status(run.id.clone(), BuddyRunStatus::Running.as_str().to_owned())?;
    event_publisher.emit_run(&run);
    abort_if_buddy_run_cancelled(
        &storage,
        &run.id,
        approval_id,
        protocol.as_str(),
        cancellation.as_ref(),
        &event_publisher,
    )?;

    let mut events = append_codex_run_start_events(
        &storage,
        &run.id,
        approval_id,
        attachment_count,
        &runtime_cwd,
        model_selection.as_ref(),
        protocol,
        &user_message_id,
        &run_context.context_pack_diagnostic,
    )?;
    event_publisher.emit_events(&events, target.event_session_id());
    let runtime_result = run_codex_runtime(CodexRuntimeRunRequest {
        approval_id,
        runtime_cwd: &runtime_cwd,
        runtime_instructions_content: run_context.runtime_instructions_content(),
        cancellation: cancellation.clone(),
        content: &content,
        input: &input,
        model_selection: model_selection.as_ref(),
        existing_thread_id: run.external_thread_id.as_deref(),
        protocol,
        run_id: &run.id,
        target: &target,
        storage: &storage,
        event_publisher: &event_publisher,
        user_message_id: &user_message_id,
    })?;
    if let Some(updated_run) = runtime_result.run {
        run = updated_run;
        event_publisher.emit_run(&run);
    }
    events.extend(runtime_result.projected_events);

    let runtime_output = runtime_result.output;
    let assistant_content = create_codex_assistant_display_content(&runtime_output.final_message);
    abort_if_buddy_run_cancelled(
        &storage,
        &run.id,
        approval_id,
        runtime_output.protocol,
        cancellation.as_ref(),
        &event_publisher,
    )?;
    let event_count_before_finalize = events.len();
    let finalize_result = persist_completed_codex_run(
        &storage,
        &mut run,
        &mut events,
        &target,
        approval_id,
        &runtime_output,
        &assistant_content,
    );
    let assistant_message = match finalize_result {
        Ok(assistant_message) => assistant_message,
        Err(error) => {
            let error_message = error.to_string();
            match record_codex_run_failure(
                &storage,
                &run.id,
                approval_id,
                runtime_output.protocol,
                format!("failed to persist completed codex run: {error_message}"),
            ) {
                Ok(finished_run) => event_publisher.emit_finished_run(&finished_run),
                Err(record_error) => {
                    return Err(BuddyError::Runtime(format!(
                        "{error_message}; failed to record run failure: {record_error}"
                    )));
                }
            }

            return Err(error);
        }
    };
    event_publisher.emit_events(
        &events[event_count_before_finalize..],
        target.event_session_id(),
    );
    event_publisher.emit_run(&run);
    record_codex_chat_turn_memory(
        &storage,
        &memory_root,
        &run,
        &content,
        &assistant_content,
        source_project,
        &intent_decision,
    );

    Ok(BuddyCodexReadOnlyExecution {
        assistant_message,
        events,
        run,
    })
}

fn select_codex_runtime_protocol(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    event_publisher: &BuddyRunStateEventPublisher,
) -> Result<BuddyRuntimeProtocol, BuddyError> {
    let runtime_status = codex::detect_codex_runtime_status();
    if runtime_status.app_server_available {
        return Ok(BuddyRuntimeProtocol::CodexAppServer);
    }
    if runtime_status.exec_json_available {
        return Ok(BuddyRuntimeProtocol::CodexExecJsonFallback);
    }

    record_codex_runtime_error_state(
        storage,
        run_id,
        approval_id,
        BuddyRuntimeProtocol::Unavailable.as_str(),
        None,
        event_publisher,
        "codex runtime is unavailable",
    )?;
    Err(BuddyError::Codex("codex runtime is unavailable".to_owned()))
}

struct PreparedCodexRunContext {
    runtime_instructions: String,
    context_pack_diagnostic: context_pack::BuddyContextPackDiagnostic,
}

impl PreparedCodexRunContext {
    fn runtime_instructions_content(&self) -> Option<&str> {
        (!self.runtime_instructions.trim().is_empty()).then_some(self.runtime_instructions.as_str())
    }
}

fn prepare_codex_run_context(
    storage: &BuddyStorage,
    memory_root: &Path,
    run_id: &str,
    target: &BuddyCodexRunTarget,
    runtime_cwd: &str,
    _content: &str,
    source_project: Option<&str>,
    intent_decision: &BuddyIntentDecision,
    selected_context: &[context_pack::BuddyContextPackSelectedContextItem],
) -> Result<PreparedCodexRunContext, BuddyError> {
    let source_refs = if intent_decision.memory_eligibility.retrieval {
        storage
            .list_recent_memory_source_refs(source_project, 6)
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let context_pack =
        context_pack::build_context_pack(context_pack::BuddyContextPackBuildInput {
            runtime_cwd,
            intent_decision,
            max_chars: 2400,
            memory_root,
            selected_context,
            source_project,
            source_refs: &source_refs,
        })?;
    let runtime_instructions =
        compose_buddy_runtime_instructions(Some(context_pack.content.as_str()));
    let context_owner_id = target.context_owner_id()?;
    let context_pack_state_key = context_pack::context_pack_state_key(
        context_owner_id,
        BuddyRuntime::Codex.as_str(),
        runtime_cwd,
    );
    let previous_context_pack_hash = storage
        .read_setting_json(&context_pack_state_key)
        .ok()
        .flatten()
        .and_then(|setting| {
            setting
                .value
                .get("packHash")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        });
    let context_pack_diagnostic = context_pack::create_context_pack_diagnostic(
        &context_pack,
        previous_context_pack_hash.as_deref(),
    );
    let _ = storage.write_setting_json(
        &context_pack::context_pack_diagnostics_key(run_id),
        serde_json::json!({
            "injected": context_pack_diagnostic.injected,
            "notModified": context_pack_diagnostic.not_modified,
            "packHash": context_pack_diagnostic.pack_hash.as_deref(),
            "retrievedMemory": &context_pack_diagnostic.retrieved_memory,
            "sourceCount": context_pack_diagnostic.retrieved_memory.len(),
            "sourceMemoryIds": &context_pack_diagnostic.source_memory_ids,
        }),
    );
    let cwd_hash = context_pack_state_key
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_owned();
    let _ = storage.write_setting_json(
        &context_pack_state_key,
        serde_json::json!({
            "packHash": context_pack.hash,
            "sessionId": target.session_id.as_deref(),
            "conversationId": target.conversation_id.as_deref(),
            "runtime": BuddyRuntime::Codex.as_str(),
            "cwdHash": cwd_hash,
        }),
    );

    Ok(PreparedCodexRunContext {
        runtime_instructions,
        context_pack_diagnostic,
    })
}

#[allow(clippy::too_many_arguments)]
fn append_codex_run_start_events(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    attachment_count: usize,
    runtime_cwd: &str,
    model_selection: Option<&codex::CodexModelSelection>,
    protocol: BuddyRuntimeProtocol,
    user_message_id: &str,
    context_pack_diagnostic: &context_pack::BuddyContextPackDiagnostic,
) -> Result<Vec<BuddyRunEvent>, BuddyError> {
    let mut events = vec![storage.append_run_event(CreateBuddyRunEventRequest {
        event_type: BuddyRunEventType::RunStarted.as_str().to_owned(),
        payload: serde_json::json!({
            "approvalId": approval_id,
            "attachmentCount": attachment_count,
            "runtime": BuddyRuntime::Codex.as_str(),
            "cwd": runtime_cwd,
            "effort": model_selection.and_then(|selection| selection.effort.as_deref()),
            "model": model_selection.and_then(|selection| selection.model.as_deref()),
            "protocol": protocol.as_str(),
            "serviceTier": model_selection.and_then(|selection| selection.service_tier.as_deref()),
            "userMessageId": user_message_id,
        }),
        run_id: run_id.to_owned(),
    })?];
    events.push(storage.append_run_event(CreateBuddyRunEventRequest {
        event_type: BuddyRunEventType::MemoryContextPack.as_str().to_owned(),
        payload: create_memory_context_pack_event_payload(context_pack_diagnostic),
        run_id: run_id.to_owned(),
    })?);

    Ok(events)
}

struct CodexRuntimeRunRequest<'a> {
    approval_id: Option<&'a str>,
    runtime_cwd: &'a str,
    runtime_instructions_content: Option<&'a str>,
    cancellation: Option<BuddyRunCancellationToken>,
    event_publisher: &'a BuddyRunStateEventPublisher,
    content: &'a str,
    input: &'a [codex::CodexUserInput],
    model_selection: Option<&'a codex::CodexModelSelection>,
    existing_thread_id: Option<&'a str>,
    protocol: BuddyRuntimeProtocol,
    run_id: &'a str,
    target: &'a BuddyCodexRunTarget,
    storage: &'a BuddyStorage,
    user_message_id: &'a str,
}

struct CodexRuntimeRunResult {
    output: CodexRuntimeOutput,
    projected_events: Vec<BuddyRunEvent>,
    run: Option<BuddyRun>,
}

fn run_codex_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    match request.protocol {
        BuddyRuntimeProtocol::CodexAppServer => run_codex_app_server_runtime(request),
        BuddyRuntimeProtocol::CodexExecJsonFallback => run_codex_exec_runtime(request),
        BuddyRuntimeProtocol::Unavailable => {
            unreachable!("unavailable protocol exits before run")
        }
    }
}

fn run_codex_app_server_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    let mut projected_events = Vec::new();
    let run_id = request.run_id.to_owned();
    let approval_cancellation = request.cancellation.clone();
    let output = match codex::run_codex_app_server_turn_with_cancellation_and_approval_handler(
        request.input,
        request.runtime_cwd,
        request.existing_thread_id,
        request.user_message_id,
        request.runtime_instructions_content,
        request.model_selection,
        request.cancellation.clone(),
        |projected_event| {
            let event = request
                .storage
                .append_run_event(CreateBuddyRunEventRequest {
                    event_type: projected_event.event_type.to_owned(),
                    payload: projected_event.payload.clone(),
                    run_id: run_id.clone(),
                })?;
            request.event_publisher.emit_event(&event, None);
            projected_events.push(event);

            Ok(())
        },
        |approval_request| {
            wait_for_codex_app_server_approval(
                request.storage,
                &run_id,
                request.runtime_cwd,
                approval_request,
                approval_cancellation.as_ref(),
            )
        },
    ) {
        Ok(output) => output,
        Err(error) => {
            let error_message = error.to_string();
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };
    let run = match request
        .storage
        .update_run_external_refs(
            request.run_id.to_owned(),
            Some(output.thread_id.clone()),
            output.turn_id.clone(),
        )
        .and_then(|run| {
            request.target.upsert_codex_runtime_binding(
                request.storage,
                request.runtime_cwd,
                output.thread_id.clone(),
            )?;

            Ok(run)
        }) {
        Ok(run) => run,
        Err(error) => {
            let error_message = error.to_string();
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };

    Ok(CodexRuntimeRunResult {
        output: CodexRuntimeOutput {
            final_memory_citation: output.final_memory_citation,
            final_message: output.final_message,
            protocol: request.protocol.as_str(),
            stdout_bytes: None,
            thread_id: Some(output.thread_id),
            turn_id: output.turn_id,
        },
        projected_events,
        run: Some(run),
    })
}

fn run_codex_exec_runtime(
    request: CodexRuntimeRunRequest<'_>,
) -> Result<CodexRuntimeRunResult, BuddyError> {
    let output_path = codex::create_codex_output_path(request.run_id);
    let prompt = memory::compose_prompt_with_context_pack(
        request.content,
        request.runtime_instructions_content,
    );
    let codex_output = match codex::run_codex_exec_with_cancellation(
        &prompt,
        &output_path,
        Some(request.runtime_cwd),
        request.cancellation.clone(),
    ) {
        Ok(output) => output,
        Err(error) => {
            let error_message = error.to_string();
            let _ = std::fs::remove_file(&output_path);
            record_codex_runtime_error_state(
                request.storage,
                request.run_id,
                request.approval_id,
                request.protocol.as_str(),
                request.cancellation.as_ref(),
                request.event_publisher,
                &error_message,
            )?;
            return Err(error);
        }
    };
    let _ = std::fs::remove_file(&output_path);

    Ok(CodexRuntimeRunResult {
        output: CodexRuntimeOutput {
            final_memory_citation: None,
            final_message: codex_output.final_message,
            protocol: request.protocol.as_str(),
            stdout_bytes: Some(codex_output.stdout.len()),
            thread_id: None,
            turn_id: None,
        },
        projected_events: Vec::new(),
        run: None,
    })
}

fn record_codex_runtime_error_state(
    storage: &BuddyStorage,
    run_id: &str,
    approval_id: Option<&str>,
    protocol: &str,
    cancellation: Option<&BuddyRunCancellationToken>,
    event_publisher: &BuddyRunStateEventPublisher,
    error_message: &str,
) -> Result<(), BuddyError> {
    if is_buddy_run_cancelled(cancellation) {
        let finished_run = record_codex_run_cancelled(storage, run_id, approval_id, protocol)?;
        event_publisher.emit_finished_run(&finished_run);
        return Ok(());
    }

    match storage.finish_run(
        run_id.to_owned(),
        BuddyRunStatus::Failed.as_str().to_owned(),
        BuddyRunEventType::RunFailed.as_str().to_owned(),
        serde_json::json!({
            "approvalId": approval_id,
            "memoryEligibility": create_runtime_error_memory_eligibility_payload(),
            "message": error_message,
            "protocol": protocol,
        }),
    ) {
        Ok(finished_run) => event_publisher.emit_finished_run(&finished_run),
        Err(record_error) => {
            return Err(BuddyError::Runtime(format!(
                "{error_message}; failed to record run failure: {record_error}"
            )));
        }
    }

    Ok(())
}

fn create_runtime_error_memory_eligibility_payload() -> serde_json::Value {
    serde_json::json!({
        "candidateGeneration": false,
        "durableWrite": false,
        "reasons": ["runtime_error"],
        "retrieval": false,
    })
}

fn create_codex_assistant_display_content(final_message: &str) -> String {
    let display_content = strip_buddy_animation_intent_blocks(final_message);
    if display_content.is_empty() {
        "Codex 已完成，但没有返回可展示文本。".to_owned()
    } else {
        display_content
    }
}

fn persist_completed_codex_run(
    storage: &BuddyStorage,
    run: &mut BuddyRun,
    events: &mut Vec<BuddyRunEvent>,
    target: &BuddyCodexRunTarget,
    approval_id: Option<&str>,
    runtime_output: &CodexRuntimeOutput,
    assistant_content: &str,
) -> Result<BuddyMessage, BuddyError> {
    let assistant_message = if let Some(session_id) = target.session_id.as_deref() {
        storage.create_message(CreateBuddyMessageRequest {
            attachments: Vec::new(),
            content: assistant_content.to_owned(),
            role: BuddyMessageRole::Assistant.as_str().to_owned(),
            session_id: session_id.to_owned(),
        })?
    } else {
        let conversation_id = target.conversation_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("assistant message conversation target is missing".to_owned())
        })?;
        let branch_id = target.branch_id.as_deref().ok_or_else(|| {
            BuddyError::Validation("assistant message branch target is missing".to_owned())
        })?;
        storage.append_conversation_message(AppendBuddyConversationMessageRequest {
            attachments: Vec::new(),
            branch_id: branch_id.to_owned(),
            content: assistant_content.to_owned(),
            conversation_id: conversation_id.to_owned(),
            parent_message_id: target.triggering_message_id.clone(),
            role: BuddyMessageRole::Assistant.as_str().to_owned(),
            run_id: Some(run.id.clone()),
            version_group_id: None,
            version_index: 1,
            version_status: BuddyMessageVersionStatus::Active.as_str().to_owned(),
        })?
    };

    events.push(storage.append_run_event(CreateBuddyRunEventRequest {
        event_type: BuddyRunEventType::MessageCompleted.as_str().to_owned(),
        payload: serde_json::json!({
            "approvalId": approval_id,
            "messageId": assistant_message.id,
            "protocol": runtime_output.protocol,
            "threadId": runtime_output.thread_id.as_deref(),
            "turnId": runtime_output.turn_id.as_deref(),
        }),
        run_id: run.id.clone(),
    })?);
    if let Some(citation) = runtime_output
        .final_memory_citation
        .clone()
        .filter(has_memory_citation_entries)
    {
        events.push(storage.append_run_event(CreateBuddyRunEventRequest {
            event_type: BuddyRunEventType::AssistantReferences.as_str().to_owned(),
            payload: create_assistant_references_event_payload(
                &assistant_message.id,
                runtime_output.thread_id.as_deref(),
                runtime_output.turn_id.as_deref(),
                citation,
            ),
            run_id: run.id.clone(),
        })?);
    }
    let completed_run = storage.finish_run(
        run.id.clone(),
        BuddyRunStatus::Completed.as_str().to_owned(),
        BuddyRunEventType::RunCompleted.as_str().to_owned(),
        serde_json::json!({
            "approvalId": approval_id,
            "protocol": runtime_output.protocol,
            "stdoutBytes": runtime_output.stdout_bytes,
            "threadId": runtime_output.thread_id.as_deref(),
            "turnId": runtime_output.turn_id.as_deref(),
        }),
    )?;
    *run = completed_run.run;
    events.push(completed_run.event);

    Ok(assistant_message)
}

fn record_codex_chat_turn_memory(
    storage: &BuddyStorage,
    memory_root: &Path,
    run: &BuddyRun,
    content: &str,
    assistant_content: &str,
    source_project: Option<String>,
    intent_decision: &BuddyIntentDecision,
) {
    if !intent_decision.memory_eligibility.candidate_generation
        || !intent_decision.memory_eligibility.durable_write
    {
        return;
    }
    if run.status != BuddyRunStatus::Completed.as_str() {
        return;
    }
    let memory_safety = memory::classify_chat_turn_memory_safety(content, assistant_content);
    if memory_safety == memory::BuddyChatTurnMemorySafety::SkipErrorResponse {
        return;
    }

    let project_id = source_project
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let scope = if project_id.is_some() {
        "project-private"
    } else {
        "global"
    };
    let source_log_path = run
        .log_path
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("legacy-run:{}", run.id));
    let source_event_id = format!("run:{}:memory_candidate:continuity.chat_turn", run.id);
    let source_refs = serde_json::json!([
        {
            "projectId": project_id.as_deref(),
            "scope": scope,
            "sourceEventId": source_event_id,
            "sourceKind": "run_log",
            "sourceLogPath": source_log_path,
            "sourceRunId": run.id
        }
    ]);
    let is_sensitive_candidate =
        memory_safety == memory::BuddyChatTurnMemorySafety::DisabledSensitiveContent;
    let candidate_content = if is_sensitive_candidate {
        memory::create_disabled_sensitive_memory_content()
    } else {
        memory::create_chat_turn_memory_content(content, assistant_content)
    };
    let candidate_decision = if is_sensitive_candidate {
        "disabled"
    } else {
        "accepted"
    };
    let candidate_reason = if is_sensitive_candidate {
        "sensitive content detected; durable memory disabled"
    } else {
        "eligible completed codex turn"
    };
    let eligibility_reasons = if is_sensitive_candidate {
        serde_json::json!(["sensitive_content_detected"])
    } else {
        serde_json::json!(intent_decision.memory_eligibility.reasons)
    };
    let candidate_request = CreateBuddyMemoryCandidateRequest {
        candidate_type: "continuity.chat_turn".to_owned(),
        confidence: 0.82,
        content: candidate_content,
        conversation_id: run.conversation_id.clone(),
        decision: candidate_decision.to_owned(),
        eligibility: serde_json::json!({
            "candidateGeneration": !is_sensitive_candidate
                && intent_decision.memory_eligibility.candidate_generation,
            "durableWrite": !is_sensitive_candidate
                && intent_decision.memory_eligibility.durable_write,
            "policy": intent_decision.memory_policy.as_str(),
            "reasons": eligibility_reasons,
            "retrieval": intent_decision.memory_eligibility.retrieval
        }),
        project_id,
        reason: candidate_reason.to_owned(),
        run_id: Some(run.id.clone()),
        scope: scope.to_owned(),
        source_event_id: Some(source_event_id),
        source_log_path,
        source_refs,
    };
    let event_payload = match serde_json::to_value(&candidate_request) {
        Ok(payload) => payload,
        Err(error) => {
            eprintln!(
                "failed to serialize lexora buddy memory candidate event for run {}: {error}",
                run.id
            );
            return;
        }
    };
    let event_result = storage.append_run_event(CreateBuddyRunEventRequest {
        event_type: BuddyRunEventType::MemoryCandidateCreated
            .as_str()
            .to_owned(),
        payload: event_payload,
        run_id: run.id.clone(),
    });
    if let Err(error) = event_result {
        eprintln!(
            "failed to record lexora buddy memory candidate event for run {}: {error}",
            run.id
        );
        return;
    }

    match storage.create_memory_candidate(candidate_request) {
        Ok(candidate) if !is_sensitive_candidate => {
            if let Err(error) =
                memory::candidates::accept_memory_candidate(storage, memory_root, &candidate.id)
            {
                eprintln!(
                    "failed to auto-apply lexora buddy memory candidate for run {}: {error}",
                    run.id
                );
            }
        }
        Ok(_) => {}
        Err(error) => {
            eprintln!(
                "failed to record lexora buddy memory candidate for run {}: {error}",
                run.id
            );
        }
    }
}

fn compose_buddy_chat_user_message_content(
    content: &str,
    attachments: &[BuddyChatAttachment],
    context_items: &[BuddyChatPromptContextItem],
) -> String {
    let mut sections = Vec::new();
    let display_content = normalize_buddy_visible_content(content, attachments);
    if !display_content.is_empty() {
        sections.push(display_content);
    }

    if !context_items.is_empty() {
        sections.push(format!(
            "上下文：{}",
            context_items
                .iter()
                .map(format_buddy_chat_context_item_inline)
                .collect::<Vec<_>>()
                .join("; ")
        ));
    }

    sections.join("\n\n")
}

fn compose_buddy_chat_runtime_content(
    content: &str,
    attachments: &[BuddyChatAttachment],
    context_items: &[BuddyChatPromptContextItem],
) -> String {
    let mut sections = Vec::new();
    let content = content.trim();
    if !content.is_empty() {
        sections.push(content.to_owned());
    }

    let context_lines = context_items
        .iter()
        .map(format_buddy_chat_context_item_runtime)
        .collect::<Vec<_>>();
    if !context_lines.is_empty() {
        sections.push(format!(
            "Codex prompt context selected in Lexora:\n{}",
            context_lines.join("\n")
        ));
    }

    let text_attachments = attachments
        .iter()
        .filter(|attachment| attachment.kind == "text")
        .filter_map(|attachment| {
            let text = attachment.text.as_deref()?.trim();
            if text.is_empty() {
                return None;
            }

            Some(format!(
                "Uploaded text file: {}\n```text\n{}\n```",
                attachment.name, text
            ))
        })
        .collect::<Vec<_>>();
    if !text_attachments.is_empty() {
        sections.push(text_attachments.join("\n\n"));
    }

    let binary_attachments = attachments
        .iter()
        .filter(|attachment| attachment.kind == "binary")
        .map(|attachment| format!("{} ({})", attachment.name, attachment.mime_type))
        .collect::<Vec<_>>();
    if !binary_attachments.is_empty() {
        sections.push(format!(
            "Uploaded binary files are available as metadata only in this Lexora turn: {}.",
            binary_attachments.join(", ")
        ));
    }

    sections.join("\n\n")
}

fn create_buddy_message_attachments(
    attachments: &[BuddyChatAttachment],
) -> Vec<BuddyMessageAttachment> {
    attachments
        .iter()
        .map(|attachment| BuddyMessageAttachment {
            attachment_id: attachment.attachment_id.clone(),
            data_url: if attachment.kind == "image" {
                attachment
                    .preview_path
                    .is_none()
                    .then(|| attachment.data_url.clone())
                    .flatten()
            } else {
                None
            },
            kind: attachment.kind.clone(),
            mime_type: attachment.mime_type.clone(),
            name: attachment.name.clone(),
            preview_path: attachment.preview_path.clone(),
            size_bytes: attachment.size_bytes,
        })
        .collect()
}

fn materialize_buddy_chat_attachments(
    state: &BuddyAppState,
    attachments: Vec<BuddyChatAttachment>,
) -> BuddyResult<Vec<BuddyChatAttachment>> {
    attachments
        .into_iter()
        .map(|attachment| materialize_buddy_chat_attachment(state, attachment))
        .collect()
}

fn materialize_buddy_chat_attachment(
    state: &BuddyAppState,
    mut attachment: BuddyChatAttachment,
) -> BuddyResult<BuddyChatAttachment> {
    let Some(attachment_id) = attachment
        .attachment_id
        .as_deref()
        .map(str::trim)
        .filter(|attachment_id| !attachment_id.is_empty())
        .map(str::to_owned)
    else {
        return Ok(attachment);
    };

    let registered = state.find_attachment(&attachment_id)?.ok_or_else(|| {
        BuddyError::Validation(format!("registered attachment not found: {attachment_id}"))
    })?;
    attachment.attachment_id = Some(registered.id);
    attachment.data_url = None;
    attachment.kind = registered.kind;
    attachment.mime_type = registered.mime_type;
    attachment.name = registered.name;
    attachment.preview_path = if attachment.kind == "image" {
        Some(registered.path.clone())
    } else {
        None
    };
    attachment.size_bytes = registered.size_bytes;
    attachment.text = if attachment.kind == "text" {
        Some(fs::read_to_string(&registered.path)?)
    } else {
        None
    };

    Ok(attachment)
}

fn normalize_buddy_visible_content(content: &str, attachments: &[BuddyChatAttachment]) -> String {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if attachments.is_empty() {
        return trimmed.to_owned();
    }

    strip_inline_attachment_reference_markers(trimmed)
}

fn strip_inline_attachment_reference_markers(content: &str) -> String {
    let mut output = String::with_capacity(content.len());
    let mut remaining = content;
    while let Some(start) = remaining.find('[') {
        output.push_str(&remaining[..start]);
        let candidate = &remaining[start..];
        if let Some(marker_length) = inline_attachment_reference_marker_length(candidate) {
            remaining = &candidate[marker_length..];
        } else {
            output.push('[');
            remaining = &candidate['['.len_utf8()..];
        }
    }
    output.push_str(remaining);

    output
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn inline_attachment_reference_marker_length(candidate: &str) -> Option<usize> {
    let prefix = if candidate.starts_with("[Image #") {
        "[Image #"
    } else if candidate.starts_with("[File #") {
        "[File #"
    } else {
        return None;
    };
    let suffix = &candidate[prefix.len()..];
    let digit_length = suffix
        .chars()
        .take_while(char::is_ascii_digit)
        .map(char::len_utf8)
        .sum::<usize>();
    if digit_length == 0 {
        return None;
    }

    suffix[digit_length..]
        .starts_with(']')
        .then_some(prefix.len() + digit_length + ']'.len_utf8())
}

fn compose_buddy_chat_codex_inputs(
    runtime_content: &str,
    requested_inputs: Vec<codex::CodexUserInput>,
    attachments: &[BuddyChatAttachment],
    builtin_skill: Option<TrustedCodexSkillInput>,
) -> BuddyResult<Vec<codex::CodexUserInput>> {
    let mut inputs = Vec::new();
    let mut replaced_text = false;

    for input in requested_inputs {
        match input {
            codex::CodexUserInput::Text { .. } if !replaced_text => {
                if !runtime_content.trim().is_empty() {
                    inputs.push(codex::CodexUserInput::Text {
                        text: runtime_content.trim().to_owned(),
                        text_elements: Vec::new(),
                    });
                }
                replaced_text = true;
            }
            codex::CodexUserInput::Text { text, .. } => {
                let text = text.trim();
                if !text.is_empty() {
                    inputs.push(codex::CodexUserInput::Text {
                        text: text.to_owned(),
                        text_elements: Vec::new(),
                    });
                }
            }
            codex::CodexUserInput::Image { detail, url } if is_safe_buddy_codex_image_url(&url) => {
                inputs.push(codex::CodexUserInput::Image { detail, url });
            }
            codex::CodexUserInput::Image { .. }
            | codex::CodexUserInput::LocalImage { .. }
            | codex::CodexUserInput::Skill { .. }
            | codex::CodexUserInput::Mention { .. } => {}
        }
    }

    if !replaced_text && !runtime_content.trim().is_empty() {
        let mut text_inputs = create_text_codex_input(runtime_content);
        text_inputs.extend(inputs);
        inputs = text_inputs;
    }

    inputs.extend(collect_buddy_chat_image_inputs(attachments)?);
    append_unique_codex_skill_input(&mut inputs, builtin_skill);
    Ok(inputs)
}

fn is_safe_buddy_codex_image_url(url: &str) -> bool {
    let url = url.trim();
    url.starts_with("data:image/") && url.contains(";base64,")
}

fn create_buddy_builtin_animation_skill_input(
    data_dir: &Path,
) -> BuddyResult<TrustedCodexSkillInput> {
    const BUDDY_ANIMATION_SKILL_NAME: &str = "lexora-buddy-animation";
    const BUDDY_ANIMATION_SKILL_MD: &str =
        include_str!("../../builtin-skills/lexora-buddy-animation/SKILL.md");

    let skill_dir = data_dir
        .join("agent-skills")
        .join(BUDDY_ANIMATION_SKILL_NAME);
    let skill_path = skill_dir.join("SKILL.md");
    std::fs::create_dir_all(&skill_dir)?;
    let should_write = std::fs::read_to_string(&skill_path)
        .map(|current| current != BUDDY_ANIMATION_SKILL_MD)
        .unwrap_or(true);
    if should_write {
        std::fs::write(&skill_path, BUDDY_ANIMATION_SKILL_MD)?;
    }

    let path = skill_path.to_str().ok_or_else(|| {
        BuddyError::Validation("Buddy builtin animation skill path is not valid UTF-8".to_owned())
    })?;

    Ok(TrustedCodexSkillInput {
        name: BUDDY_ANIMATION_SKILL_NAME.to_owned(),
        path: path.to_owned(),
    })
}

fn append_unique_codex_skill_input(
    inputs: &mut Vec<codex::CodexUserInput>,
    skill: Option<TrustedCodexSkillInput>,
) {
    let Some(TrustedCodexSkillInput { name, path }) = skill else {
        return;
    };

    let already_present = inputs.iter().any(|input| {
        matches!(
            input,
            codex::CodexUserInput::Skill {
                name: existing_name,
                path: existing_path,
            } if existing_name == &name || existing_path == &path
        )
    });
    if !already_present {
        inputs.push(codex::CodexUserInput::Skill { name, path });
    }
}

fn create_text_codex_input(content: &str) -> Vec<codex::CodexUserInput> {
    let content = content.trim();
    if content.is_empty() {
        return Vec::new();
    }

    vec![codex::CodexUserInput::Text {
        text: content.to_owned(),
        text_elements: Vec::new(),
    }]
}

fn collect_buddy_chat_image_inputs(
    attachments: &[BuddyChatAttachment],
) -> BuddyResult<Vec<codex::CodexUserInput>> {
    let mut inputs = Vec::new();
    for attachment in attachments
        .iter()
        .filter(|attachment| attachment.kind == "image")
    {
        let Some(url) = create_buddy_chat_image_input_url(attachment)? else {
            continue;
        };

        inputs.push(codex::CodexUserInput::Image {
            detail: Some("auto".to_owned()),
            url,
        });
    }

    Ok(inputs)
}

fn create_buddy_chat_image_input_url(
    attachment: &BuddyChatAttachment,
) -> BuddyResult<Option<String>> {
    if let Some(data_url) = attachment.data_url.as_deref().map(str::trim) {
        if !data_url.is_empty() {
            return Ok(Some(data_url.to_owned()));
        }
    }

    let Some(preview_path) = attachment.preview_path.as_deref().map(str::trim) else {
        return Ok(None);
    };
    if preview_path.is_empty() {
        return Ok(None);
    }

    let bytes = fs::read(preview_path)?;
    Ok(Some(format!(
        "data:{};base64,{}",
        attachment.mime_type,
        BASE64_STANDARD.encode(bytes)
    )))
}

fn format_buddy_chat_context_item_inline(item: &BuddyChatPromptContextItem) -> String {
    match item.kind.as_str() {
        "slashCommand" => item.value.clone(),
        "skill" => format!("${}", item.label),
        "plugin" | "file" => format!("@{}", item.label),
        _ => item.label.clone(),
    }
}

fn format_buddy_chat_context_item_runtime(item: &BuddyChatPromptContextItem) -> String {
    let description = item
        .description
        .as_deref()
        .filter(|description| !description.trim().is_empty())
        .map(|description| format!(": {}", description.trim()))
        .unwrap_or_default();

    match item.kind.as_str() {
        "slashCommand" => format!("- Slash command {}{}", item.value, description),
        "skill" => format!("- Skill ${}{}", item.value, description),
        "plugin" => format!("- Plugin @{} ({}){}", item.value, item.label, description),
        "file" => format!(
            "- File @{}{}",
            item.path.as_deref().unwrap_or(item.value.as_str()),
            description
        ),
        _ => format!("- {}{}", item.label, description),
    }
}

fn compose_buddy_runtime_instructions(context_pack: Option<&str>) -> String {
    match context_pack {
        Some(context_pack) if !context_pack.trim().is_empty() => context_pack.trim().to_owned(),
        _ => String::new(),
    }
}

fn strip_buddy_animation_intent_blocks(content: &str) -> String {
    let Some(start_index) = content.find(BUDDY_ANIMATION_INTENT_START_TAG) else {
        return content.trim().to_owned();
    };
    let body_start = start_index + BUDDY_ANIMATION_INTENT_START_TAG.len();
    let Some(end_offset) = content[body_start..].find(BUDDY_ANIMATION_INTENT_END_TAG) else {
        return content[..start_index].trim().to_owned();
    };

    let body_end = body_start + end_offset;
    let after_end = body_end + BUDDY_ANIMATION_INTENT_END_TAG.len();
    format!("{}{}", &content[..start_index], &content[after_end..])
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

struct CodexRuntimeOutput {
    final_memory_citation: Option<serde_json::Value>,
    final_message: String,
    protocol: &'static str,
    stdout_bytes: Option<usize>,
    thread_id: Option<String>,
    turn_id: Option<String>,
}

fn create_memory_context_pack_event_payload(
    diagnostic: &context_pack::BuddyContextPackDiagnostic,
) -> serde_json::Value {
    serde_json::json!({
        "available": diagnostic.injected || diagnostic.pack_hash.is_some() || !diagnostic.retrieved_memory.is_empty(),
        "conversationPath": &diagnostic.conversation_path,
        "intent": &diagnostic.intent,
        "injected": diagnostic.injected,
        "memoryEligibility": &diagnostic.memory_eligibility,
        "notModified": diagnostic.not_modified,
        "packHashPrefix": diagnostic.pack_hash.as_deref().map(hash_prefix),
        "persona": &diagnostic.persona,
        "projectScope": &diagnostic.project_scope,
        "entries": &diagnostic.retrieved_memory,
        "retrievedMemory": &diagnostic.retrieved_memory,
        "runtimeInstruction": &diagnostic.runtime_instruction,
        "selectedContext": &diagnostic.selected_context,
        "source": "buddy_context_pack",
        "sourceCount": diagnostic.retrieved_memory.len(),
        "sourceMemoryIds": &diagnostic.source_memory_ids,
    })
}

fn hydrate_memory_context_pack_events(
    _storage: &BuddyStorage,
    events: Vec<BuddyRunEvent>,
) -> BuddyResult<Vec<BuddyRunEvent>> {
    Ok(events)
}

fn create_assistant_references_event_payload(
    message_id: &str,
    thread_id: Option<&str>,
    turn_id: Option<&str>,
    citation: serde_json::Value,
) -> serde_json::Value {
    serde_json::json!({
        "citation": citation,
        "messageId": message_id,
        "source": "codex_native_memory",
        "threadId": thread_id,
        "turnId": turn_id,
    })
}

fn has_memory_citation_entries(citation: &serde_json::Value) -> bool {
    citation
        .get("entries")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|entries| !entries.is_empty())
}

fn hash_prefix(value: &str) -> String {
    value.chars().take(8).collect()
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

#[tauri::command]
pub async fn list_buddy_runs(
    state: State<'_, BuddyAppState>,
    session_id: Option<String>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyRun>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_runs", move || {
        storage.list_runs(session_id, limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub async fn get_buddy_run(
    state: State<'_, BuddyAppState>,
    run_id: String,
) -> BuddyCommandResult<BuddyRun> {
    let storage = state.storage_handle();
    run_buddy_blocking("get_buddy_run", move || storage.find_run(run_id)).await
}

#[tauri::command]
pub async fn list_buddy_run_events(
    state: State<'_, BuddyAppState>,
    run_id: String,
    after_id: Option<i64>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_run_events", move || {
        let events = storage.list_run_events(run_id, after_id, limit.unwrap_or(100))?;

        hydrate_memory_context_pack_events(&storage, events)
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_chat_run_events(
    state: State<'_, BuddyAppState>,
    run_id: String,
    after_id: Option<i64>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyChatRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_chat_run_events", move || {
        storage.list_chat_run_events(run_id, after_id, limit.unwrap_or(100))
    })
    .await
}

#[tauri::command]
pub async fn count_buddy_run_events(
    state: State<'_, BuddyAppState>,
    run_ids: Vec<String>,
) -> BuddyCommandResult<Vec<BuddyRunEventCount>> {
    let storage = state.storage_handle();
    run_buddy_blocking("count_buddy_run_events", move || {
        storage.count_run_events(run_ids)
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_run_event_summaries(
    state: State<'_, BuddyAppState>,
    run_id: String,
    after_id: Option<i64>,
    limit: Option<i64>,
    payload_preview_chars: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyRunEventSummary>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_run_event_summaries", move || {
        storage.list_run_event_summaries(
            run_id,
            after_id,
            limit.unwrap_or(100),
            payload_preview_chars.unwrap_or(360),
        )
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_session_run_events(
    state: State<'_, BuddyAppState>,
    session_id: String,
    after_id: Option<i64>,
    run_limit: Option<i64>,
    event_limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_session_run_events", move || {
        let events = storage.list_session_run_events(
            session_id,
            after_id,
            run_limit.unwrap_or(40),
            event_limit.unwrap_or(2000),
        )?;

        hydrate_memory_context_pack_events(&storage, events)
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_conversation_run_events(
    state: State<'_, BuddyAppState>,
    conversation_id: String,
    after_id: Option<i64>,
    run_limit: Option<i64>,
    event_limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_conversation_run_events", move || {
        let events = storage.list_conversation_run_events(
            conversation_id,
            after_id,
            run_limit.unwrap_or(40),
            event_limit.unwrap_or(2000),
        )?;

        hydrate_memory_context_pack_events(&storage, events)
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_chat_session_events(
    state: State<'_, BuddyAppState>,
    session_id: String,
    after_id: Option<i64>,
    run_limit: Option<i64>,
    event_limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyChatRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_chat_session_events", move || {
        storage.list_chat_session_run_events(
            session_id,
            after_id,
            run_limit.unwrap_or(40),
            event_limit.unwrap_or(2000),
        )
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_chat_conversation_events(
    state: State<'_, BuddyAppState>,
    conversation_id: String,
    after_id: Option<i64>,
    run_limit: Option<i64>,
    event_limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyChatRunEvent>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_chat_conversation_events", move || {
        storage.list_chat_conversation_run_events(
            conversation_id,
            after_id,
            run_limit.unwrap_or(40),
            event_limit.unwrap_or(2000),
        )
    })
    .await
}

#[tauri::command]
pub async fn list_buddy_approvals(
    state: State<'_, BuddyAppState>,
    status: Option<String>,
    limit: Option<i64>,
) -> BuddyCommandResult<Vec<BuddyApproval>> {
    let storage = state.storage_handle();
    run_buddy_blocking("list_buddy_approvals", move || {
        storage.list_approvals(status, limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub fn deny_buddy_approval(
    state: State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<serde_json::Value> {
    let approval = state.find_approval(approval_id.clone())?;
    if approval.kind == CODEX_APP_SERVER_REQUEST_APPROVAL_KIND {
        return Ok(
            serde_json::to_value(state.resolve_codex_app_server_request_approval(
                approval_id,
                BuddyApprovalStatus::Denied.as_str().to_owned(),
            )?)
            .map_err(BuddyError::from)?,
        );
    }

    Ok(
        serde_json::to_value(state.deny_read_only_task_approval(approval_id)?)
            .map_err(BuddyError::from)?,
    )
}

#[tauri::command]
pub fn approve_buddy_codex_app_server_request_approval(
    state: State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<BuddyResolvedCodexAppServerRequestApproval> {
    Ok(state.resolve_codex_app_server_request_approval(
        approval_id,
        BuddyApprovalStatus::Approved.as_str().to_owned(),
    )?)
}

#[tauri::command]
pub fn approve_buddy_read_only_task(
    state: State<'_, BuddyAppState>,
    approval_id: String,
) -> BuddyCommandResult<BuddyReadOnlyTaskApprovalTurn> {
    let plan = state.approve_read_only_task_approval(approval_id)?;
    let (runtime_cwd, source_project) = resolve_runtime_cwd(state.inner(), plan.run.cwd.clone())?;
    let intent_decision = intent::default_agent_task_decision(Some(&runtime_cwd));
    let session_id = plan.message.session_id.clone().ok_or_else(|| {
        BuddyError::Validation("read-only task message is not bound to a session".to_owned())
    })?;
    let execution = execute_existing_codex_read_only_run(ExistingCodexReadOnlyRunRequest {
        approval_id: Some(plan.approval.id.clone()),
        attachment_count: 0,
        runtime_cwd,
        content: plan.message.content.clone(),
        input: create_text_codex_input(&plan.message.content),
        intent_decision,
        memory_root: state.memories_dir_path(),
        model_selection: None,
        run: plan.run,
        selected_context: Vec::new(),
        target: BuddyCodexRunTarget::session(session_id),
        source_project,
        storage: state.storage_handle(),
        cancellation: None,
        event_publisher: BuddyRunStateEventPublisher::disabled(),
        user_message_id: plan.message.id.clone(),
    })?;
    let mut events = vec![plan.event];
    events.extend(execution.events);

    Ok(BuddyReadOnlyTaskApprovalTurn {
        approval: plan.approval,
        assistant_message: execution.assistant_message,
        events,
        run: execution.run,
        user_message: plan.message,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        compose_buddy_chat_codex_inputs, compose_buddy_chat_runtime_content,
        compose_buddy_chat_user_message_content, create_buddy_agent_turn_plan,
        create_buddy_clipboard_file_from_path, create_buddy_clipboard_files_from_paths,
        create_codex_app_server_approval_scope, create_memory_context_pack_event_payload,
        materialize_buddy_chat_attachments, persist_completed_codex_run, prepare_codex_run_context,
        record_codex_chat_turn_memory, record_codex_run_cancelled,
        record_codex_runtime_error_state, wait_for_codex_app_server_approval, BuddyChatAttachment,
        BuddyChatPromptContextItem, BuddyCodexRunTarget, BuddyRunCancellationRegistry,
        BuddyRunStateEventPublisher, CodexRuntimeOutput, StartBuddyAgentTurnRequest,
        TrustedCodexSkillInput,
    };
    use crate::agents::codex;
    use crate::context_pack::{
        BuddyContextPackConversationPath, BuddyContextPackDiagnostic, BuddyContextPackIntent,
        BuddyContextPackMemoryEligibility, BuddyContextPackPersona, BuddyContextPackProjectScope,
        BuddyContextPackRetrievedMemory, BuddyContextPackRuntimeInstruction,
        BuddyContextPackSelectedContext, BuddyContextPackSelectedContextItem,
    };
    use crate::intent::{self, BuddyChatIntent, BuddyIntentClassificationInput};
    use crate::storage::{
        AppendBuddyConversationMessageRequest, BuddyStorage, CreateBuddyConversationRequest,
        CreateBuddyConversationRunRequest, CreateBuddyMemoryCandidateRequest,
        CreateBuddyMemoryItemRequest, CreateBuddyRunRequest, CreateBuddySessionRequest,
        UpsertBuddyProjectRequest,
    };
    use crate::{app_paths::BuddyAppPaths, state::BuddyAppState};
    use std::{fs, path::PathBuf, sync::atomic::Ordering};

    #[test]
    fn materializes_registered_text_attachment_from_storage() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
            .expect("initialize state");
        let path = dir.join("note.txt");
        fs::write(&path, "hello from registry").expect("write text");
        let payload = create_buddy_clipboard_file_from_path(&state, &path, "file-picker")
            .expect("create payload")
            .expect("payload");
        let attachment_id = payload.attachment_id.expect("attachment id");

        let attachments = materialize_buddy_chat_attachments(
            &state,
            vec![BuddyChatAttachment {
                attachment_id: Some(attachment_id),
                data_url: Some("data:text/plain;base64,ZmFrZQ==".to_owned()),
                kind: "binary".to_owned(),
                mime_type: "application/octet-stream".to_owned(),
                name: "forged.bin".to_owned(),
                preview_path: Some("/tmp/forged.txt".to_owned()),
                size_bytes: 999,
                text: None,
            }],
        )
        .expect("materialize attachments");
        let runtime_content =
            compose_buddy_chat_runtime_content("总结 [File #1]", &attachments, &[]);

        assert_eq!(attachments[0].kind, "text");
        assert_eq!(attachments[0].name, "note.txt");
        assert_eq!(attachments[0].text.as_deref(), Some("hello from registry"));
        assert!(runtime_content.contains("Uploaded text file: note.txt"));
        assert!(runtime_content.contains("hello from registry"));
        assert!(!runtime_content.contains("forged"));

        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }

    #[test]
    fn rejects_oversized_clipboard_file_payloads_before_reading_bytes() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
            .expect("initialize state");
        fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("large.txt");
        let file = fs::File::create(&path).expect("create large file");
        file.set_len(8 * 1024 * 1024 + 1)
            .expect("resize large file");

        let error = create_buddy_clipboard_file_from_path(&state, &path, "clipboard-file")
            .expect_err("large clipboard file should be rejected");

        assert!(error.to_string().contains("clipboard file is too large"));
        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }

    #[test]
    fn limits_native_clipboard_file_payload_count() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
            .expect("initialize state");
        fs::create_dir_all(&dir).expect("create temp dir");
        let paths = (0..20)
            .map(|index| {
                let path = dir.join(format!("note-{index}.txt"));
                fs::write(&path, format!("note {index}")).expect("write text");
                path
            })
            .collect::<Vec<_>>();

        let files = create_buddy_clipboard_files_from_paths(&state, &paths, "clipboard-file")
            .expect("create payloads");

        assert_eq!(files.len(), 16);
        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }

    #[test]
    fn run_cancellation_registry_cancels_only_the_registered_run() {
        let registry = BuddyRunCancellationRegistry::default();
        let first = registry.register("run-1");
        let second = registry.register("run-2");

        assert!(registry.cancel("run-1"));

        assert!(first.load(Ordering::SeqCst));
        assert!(!second.load(Ordering::SeqCst));
        registry.remove("run-1");
        assert!(!registry.cancel("run-1"));
    }
    #[test]
    fn records_cancelled_run_terminal_event() {
        let storage = create_codex_approval_test_storage();
        let run = create_codex_approval_test_run(&storage);

        let cancelled = record_codex_run_cancelled(&storage, &run.id, None, "codex_app_server")
            .expect("record cancellation");
        let events = storage
            .list_run_events(run.id, None, 10)
            .expect("list events");

        assert_eq!(cancelled.run.status, "cancelled");
        assert_eq!(events[0].event_type, "run.cancelled");
        assert_eq!(events[0].payload["reason"], "user_cancelled");
        assert_eq!(events[0].payload["protocol"], "codex_app_server");
    }

    #[test]
    fn keeps_command_approval_inside_authorized_project_for_user_review() {
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "pnpm type-check",
                "cwd": "/tmp/lexora-project/apps/buddy",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_eq!(scope.decision, "requires_user_review");
        assert_eq!(scope.status, "authorized");
        assert_eq!(scope.cwd, "/tmp/lexora-project/apps/buddy");
        assert_eq!(
            scope.target_root.as_deref(),
            Some("/tmp/lexora-project/apps/buddy")
        );
        assert_eq!(scope.authorization_root, "/tmp/lexora-project");
    }

    #[test]
    fn auto_denies_command_approval_outside_authorized_project() {
        let storage = create_codex_approval_test_storage();
        let run = create_codex_approval_test_run(&storage);
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "touch /tmp/outside",
                "cwd": "/tmp/other-project",
            }),
        );

        let decision = wait_for_codex_app_server_approval(
            &storage,
            &run.id,
            "/tmp/lexora-project",
            &request,
            None,
        )
        .expect("approval decision");
        let approvals = storage.list_approvals(None, 10).expect("list approvals");
        let events = storage
            .list_run_events(run.id, None, 10)
            .expect("list events");

        assert_eq!(decision, codex::CodexAppServerApprovalDecision::Decline);
        assert_eq!(approvals[0].status, "denied");
        assert_eq!(approvals[0].payload["scopeDecision"], "auto_denied");
        assert_eq!(
            approvals[0].payload["scopeStatus"],
            "outside_authorized_project"
        );
        assert_eq!(approvals[0].payload["targetRoot"], "/tmp/other-project");
        assert_eq!(events[0].event_type, "approval.resolved");
        assert_eq!(events[0].payload["status"], "denied");
    }

    #[test]
    fn auto_denies_file_change_grant_root_outside_authorized_project() {
        let request = create_codex_app_server_approval_request(
            "item/fileChange/requestApproval",
            serde_json::json!({
                "grantRoot": "/tmp/other-project",
                "reason": "need extra write access",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "outside_authorized_project");
        assert_eq!(scope.target_root.as_deref(), Some("/tmp/other-project"));
    }

    #[cfg(unix)]
    #[test]
    fn auto_denies_approval_when_cwd_escapes_authorized_project_through_symlink() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-approval-symlink");
        let project_root = temp_dir.join("project");
        let outside_root = temp_dir.join("outside");
        fs::create_dir_all(&project_root).expect("create project");
        fs::create_dir_all(&outside_root).expect("create outside");
        std::os::unix::fs::symlink(&outside_root, project_root.join("linked-outside"))
            .expect("create symlink");
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "touch marker",
                "cwd": project_root.join("linked-outside").to_string_lossy(),
            }),
        );

        let scope =
            create_codex_app_server_approval_scope(&project_root.to_string_lossy(), &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "outside_authorized_project");
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn auto_denies_permissions_approval_requests_even_inside_authorized_project() {
        let request = create_codex_app_server_approval_request(
            "item/permissions/requestApproval",
            serde_json::json!({
                "cwd": "/tmp/lexora-project",
                "permissions": {
                    "filesystem": {
                        "read": ["/tmp/lexora-project"],
                        "write": ["/tmp/lexora-project"]
                    }
                },
                "reason": "request broader permission profile",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "unsupported_request");
        assert_eq!(scope.cwd, "/tmp/lexora-project");
    }

    #[test]
    fn creates_memory_context_pack_event_payload_with_memory_file_refs() {
        let diagnostic = BuddyContextPackDiagnostic {
            injected: true,
            not_modified: false,
            pack_hash: Some("1234567890abcdef".to_owned()),
            source_memory_ids: Vec::new(),
            persona: BuddyContextPackPersona {
                name: "Lexora Buddy".to_owned(),
                response_language: "zh-CN".to_owned(),
                role: "local agent".to_owned(),
            },
            intent: BuddyContextPackIntent {
                runtime: Some("codex".to_owned()),
                memory_policy: "standard".to_owned(),
                name: "agent_task".to_owned(),
                reason: "default agent task".to_owned(),
            },
            project_scope: BuddyContextPackProjectScope {
                cwd: "/tmp/lexora".to_owned(),
                source_project: Some("/tmp/lexora".to_owned()),
            },
            conversation_path: BuddyContextPackConversationPath {
                note: "current turn supplied separately".to_owned(),
            },
            selected_context: BuddyContextPackSelectedContext { items: Vec::new() },
            memory_eligibility: BuddyContextPackMemoryEligibility {
                candidate_generation: true,
                durable_write: true,
                reasons: vec!["agent_task".to_owned()],
                retrieval: true,
            },
            retrieved_memory: vec![BuddyContextPackRetrievedMemory {
                citation_label: "global/raw_memories.md:12-18".to_owned(),
                content: "用户：怎样处理 OpenRGB？\nLexora：先检查 OpenRGB server。".to_owned(),
                content_hash: "hash-1".to_owned(),
                line_end: 18,
                line_start: 12,
                note: "Accepted Buddy memory file reference.".to_owned(),
                path: "global/raw_memories.md".to_owned(),
                project_id: None,
                scope: "global".to_owned(),
                source_event_id: Some("event-1".to_owned()),
                source_kind: "buddy_memory_file".to_owned(),
                source_run_id: Some("run-1".to_owned()),
            }],
            runtime_instruction: BuddyContextPackRuntimeInstruction {
                items: vec!["current user request wins".to_owned()],
            },
        };

        let payload = create_memory_context_pack_event_payload(&diagnostic);

        assert_eq!(payload["source"], "buddy_context_pack");
        assert_eq!(payload["available"], true);
        assert_eq!(payload["injected"], true);
        assert_eq!(payload["notModified"], false);
        assert_eq!(payload["packHashPrefix"], "12345678");
        assert_eq!(payload["sourceCount"], 1);
        assert_eq!(payload["sourceMemoryIds"].as_array().unwrap().len(), 0);
        assert_eq!(payload["entries"][0]["sourceKind"], "buddy_memory_file");
        assert_eq!(payload["entries"][0]["path"], "global/raw_memories.md");
        assert_eq!(payload["entries"][0]["lineStart"], 12);
        assert_eq!(payload["retrievedMemory"][0]["sourceRunId"], "run-1");
        assert_eq!(payload["intent"]["name"], "agent_task");
    }
    #[test]
    fn creates_first_buddy_agent_turn_with_conversation_seed() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-agent-first-turn");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
                .expect("initialize state");

        let plan = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "分析 Lexora 配置".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: None,
                    scope: "global".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("分析 Lexora 配置".to_owned()),
                }),
                cwd: None,
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .expect("create agent turn plan");

        assert_eq!(
            plan.user_message.conversation_id.as_deref(),
            Some(plan.conversation.id.as_str())
        );
        assert_eq!(
            plan.user_message.branch_id.as_deref(),
            Some(plan.conversation.active_branch_id.as_str())
        );
        assert_eq!(
            plan.run
                .as_ref()
                .and_then(|run| run.conversation_id.as_deref()),
            Some(plan.conversation.id.as_str())
        );
        assert_eq!(
            plan.run.as_ref().and_then(|run| run.branch_id.as_deref()),
            Some(plan.conversation.active_branch_id.as_str())
        );
        assert_eq!(
            plan.run
                .as_ref()
                .and_then(|run| run.triggering_message_id.as_deref()),
            Some(plan.user_message.id.as_str())
        );
        assert_eq!(
            plan.run.as_ref().and_then(|run| run.intent.as_deref()),
            Some("buddy.agent.turn")
        );

        let run_log_path = plan
            .run
            .as_ref()
            .and_then(|run| run.log_path.as_deref())
            .expect("run log path");
        let run_log_line = state
            .storage_handle()
            .read_local_log_lines_for_test(run_log_path)
            .into_iter()
            .next()
            .expect("run meta line");
        let run_meta: serde_json::Value = serde_json::from_str(&run_log_line).expect("json line");
        assert_eq!(run_meta["type"], "run_meta");
        assert_eq!(
            run_meta["payload"]["conversationId"],
            plan.conversation.id.as_str()
        );
        assert_eq!(
            run_meta["payload"]["branchId"],
            plan.conversation.active_branch_id.as_str()
        );
        assert_eq!(
            run_meta["payload"]["triggeringMessageId"],
            plan.user_message.id.as_str()
        );
        assert_eq!(run_meta["payload"]["intent"], "buddy.agent.turn");

        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn companion_chat_does_not_create_codex_run_or_memory_item() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-companion-chat");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
                .expect("initialize state");

        let plan = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "你好".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: None,
                    scope: "global".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("你好".to_owned()),
                }),
                cwd: None,
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .expect("create companion turn");

        assert_eq!(plan.decision.intent, BuddyChatIntent::CompanionChat);
        assert!(plan.assistant_message.is_some());
        assert!(plan.run.is_none());
        assert_eq!(
            plan.assistant_message
                .as_ref()
                .map(|message| message.content.as_str()),
            Some("你好，我在。")
        );
        let messages = state
            .storage_handle()
            .list_active_conversation_messages(plan.conversation.id.clone(), 10)
            .expect("list messages");
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
        assert!(messages[1].run_id.is_none());
        assert!(state
            .storage_handle()
            .list_runs(None, 10)
            .expect("list runs")
            .is_empty());
        assert!(state
            .storage_handle()
            .search_memory_items("你好", None, 10)
            .expect("search memory")
            .is_empty());

        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn direct_answer_in_project_conversation_uses_local_reply_without_project_memory() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-direct-answer");
        let data_dir = temp_dir.join("data");
        let project_root = temp_dir.join("project");
        fs::create_dir_all(&project_root).expect("create project");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
                .expect("initialize state");
        let project = state
            .upsert_project(crate::storage::UpsertBuddyProjectRequest {
                name: Some("Project".to_owned()),
                root: project_root.to_string_lossy().into_owned(),
            })
            .expect("authorize project");
        let storage = state.storage_handle();
        let plan = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "你是谁？".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: Some(project.root.clone()),
                    scope: "project".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("Project direct answer".to_owned()),
                }),
                cwd: Some(project.root),
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .expect("create direct answer plan");
        let run_events = storage
            .list_conversation_run_events(plan.conversation.id.clone(), None, 20, 20)
            .expect("list conversation run events");
        let messages = storage
            .list_active_conversation_messages(plan.conversation.id.clone(), 10)
            .expect("list messages");

        assert_eq!(plan.decision.intent, BuddyChatIntent::DirectAnswer);
        assert!(!plan.decision.requires_runtime);
        assert_eq!(plan.decision.cwd.as_deref(), None);
        assert!(!plan.decision.memory_eligibility.retrieval);
        assert!(!plan.decision.memory_eligibility.candidate_generation);
        assert!(!plan.decision.memory_eligibility.durable_write);
        assert!(plan.run.is_none());
        assert!(run_events.is_empty());
        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list memory candidates")
            .is_empty());
        assert_eq!(messages.len(), 2);
        assert!(messages[1].content.contains("Lexora Buddy"));
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn agent_turn_records_router_decision_in_conversation_and_run_logs() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-router-decision-log");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
                .expect("initialize state");

        let plan = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "分析当前项目结构".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: None,
                    scope: "global".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("分析当前项目结构".to_owned()),
                }),
                cwd: None,
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .expect("create agent turn");
        let run = plan.run.as_ref().expect("runtime run");

        let conversation_events = read_jsonl_events(
            &state
                .storage_handle()
                .read_local_log_lines_for_test(&plan.conversation.log_path),
        );
        let run_events = read_jsonl_events(
            &state
                .storage_handle()
                .read_local_log_lines_for_test(run.log_path.as_deref().expect("run log path")),
        );
        let conversation_decision = conversation_events
            .iter()
            .find(|line| line["type"] == "router.decision")
            .expect("conversation router decision");
        let run_decision = run_events
            .iter()
            .find(|line| line["type"] == "router.decision")
            .expect("run router decision");

        assert_eq!(
            conversation_decision["payload"]["conversationId"],
            plan.conversation.id
        );
        assert_eq!(conversation_decision["payload"]["intent"], "agent_task");
        assert_eq!(conversation_decision["payload"]["runtime"], "codex");
        assert_eq!(
            conversation_decision["payload"]["memoryEligibility"]["retrieval"],
            true
        );
        assert_eq!(
            run_decision["payload"]["event"],
            conversation_decision["payload"]
        );
        assert_eq!(run_decision["payload"]["eventType"], "router.decision");

        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn attachment_task_does_not_query_memory_with_raw_attachment_text() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let memory = storage
            .create_memory_item(CreateBuddyMemoryItemRequest {
                confidence: 1.0,
                content: "ATTACHMENT_ONLY_SECRET_TOKEN".to_owned(),
                expires_at: None,
                memory_type: "continuity.chat_turn".to_owned(),
                scope: "global".to_owned(),
                source_project: None,
                source_run_id: None,
                tags: vec!["attachment".to_owned()],
            })
            .expect("create memory");
        let conversation = storage
            .create_conversation(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Attachment task".to_owned()),
            })
            .expect("create conversation");
        let user_message = storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: "分析附件".to_owned(),
                conversation_id: conversation.id.clone(),
                parent_message_id: None,
                role: "user".to_owned(),
                run_id: None,
                version_group_id: None,
                version_index: 1,
                version_status: "active".to_owned(),
            })
            .expect("append user message");
        let run = storage
            .create_conversation_run(CreateBuddyConversationRunRequest {
                runtime: "codex".to_owned(),
                branch_id: conversation.active_branch_id.clone(),
                conversation_id: conversation.id.clone(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                intent: "attachment_task".to_owned(),
                triggering_message_id: user_message.id,
            })
            .expect("create run");
        let decision = intent::classify_buddy_intent(BuddyIntentClassificationInput {
            content: "分析附件",
            cwd: Some("/tmp"),
            has_attachments: true,
            has_context_items: false,
            has_project_scope: false,
            has_structured_inputs: false,
        });
        let target = BuddyCodexRunTarget::conversation(
            conversation.id,
            conversation.active_branch_id,
            "message-user".to_owned(),
        );

        let memory_root = create_buddy_test_dir("lexora-buddy-empty-context-memory");
        let prepared = prepare_codex_run_context(
            &storage,
            &memory_root,
            &run.id,
            &target,
            "/tmp",
            "分析附件\n\nUploaded text file: secret.txt\n```text\nATTACHMENT_ONLY_SECRET_TOKEN\n```",
            None,
            &decision,
            &[],
        )
        .expect("prepare context");

        assert!(prepared.context_pack_diagnostic.injected);
        assert!(prepared
            .runtime_instructions
            .contains("attachment_metadata_only"));
        assert!(!prepared
            .runtime_instructions
            .contains("ATTACHMENT_ONLY_SECRET_TOKEN"));
        assert!(!prepared
            .context_pack_diagnostic
            .source_memory_ids
            .contains(&memory.id));
        assert!(prepared.context_pack_diagnostic.retrieved_memory.is_empty());
        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    }

    #[test]
    fn context_pack_does_not_inject_legacy_sqlite_memory_items() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let memory_root = create_buddy_test_dir("lexora-buddy-context-legacy-memory");
        let legacy_memory = storage
            .create_memory_item(CreateBuddyMemoryItemRequest {
                confidence: 1.0,
                content: "LEGACY_CONTEXT_PACK_SHOULD_NOT_APPEAR".to_owned(),
                expires_at: None,
                memory_type: "continuity.chat_turn".to_owned(),
                scope: "global".to_owned(),
                source_project: None,
                source_run_id: None,
                tags: vec!["legacy".to_owned()],
            })
            .expect("create legacy memory");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Legacy memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id.clone(),
            })
            .expect("create run");
        let decision = intent::default_agent_task_decision(Some("/tmp"));
        let target = BuddyCodexRunTarget::session(session.id);

        let prepared = prepare_codex_run_context(
            &storage,
            &memory_root,
            &run.id,
            &target,
            "/tmp",
            "LEGACY_CONTEXT_PACK_SHOULD_NOT_APPEAR",
            None,
            &decision,
            &[],
        )
        .expect("prepare context");

        assert!(prepared.context_pack_diagnostic.injected);
        assert!(!prepared
            .runtime_instructions
            .contains(&legacy_memory.content));
        assert!(!prepared
            .context_pack_diagnostic
            .source_memory_ids
            .contains(&legacy_memory.id));
        assert!(prepared.context_pack_diagnostic.retrieved_memory.is_empty());

        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    }

    #[test]
    fn context_pack_injects_accepted_memory_file_refs() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let memory_root = create_buddy_test_dir("lexora-buddy-context-accepted-memory");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Accepted memory context".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id.clone(),
            })
            .expect("create run");
        let candidate = storage
            .create_memory_candidate(crate::storage::CreateBuddyMemoryCandidateRequest {
                candidate_type: "continuity.chat_turn".to_owned(),
                confidence: 0.91,
                content: "用户偏好：Buddy context pack 必须展示文件路径和行号。".to_owned(),
                conversation_id: None,
                decision: "accepted".to_owned(),
                eligibility: serde_json::json!({
                    "candidateGeneration": true,
                    "durableWrite": true,
                    "retrieval": true
                }),
                project_id: None,
                reason: "accepted memory should enter context pack by file ref".to_owned(),
                run_id: Some(run.id.clone()),
                scope: "global".to_owned(),
                source_event_id: Some("event-accepted".to_owned()),
                source_log_path: "runs/accepted.jsonl".to_owned(),
                source_refs: serde_json::json!([{
                    "sourceKind": "run_log",
                    "sourceRunId": run.id.clone(),
                    "sourceEventId": "event-accepted"
                }]),
            })
            .expect("create candidate");
        let accepted = crate::memory::candidates::accept_memory_candidate(
            &storage,
            &memory_root,
            &candidate.id,
        )
        .expect("accept candidate");
        let decision = intent::default_agent_task_decision(Some("/tmp"));
        let target = BuddyCodexRunTarget::session(session.id);

        let prepared = prepare_codex_run_context(
            &storage,
            &memory_root,
            &run.id,
            &target,
            "/tmp",
            "请继续按我的偏好说明 context pack",
            None,
            &decision,
            &[],
        )
        .expect("prepare context");

        assert!(prepared.context_pack_diagnostic.injected);
        assert!(prepared
            .runtime_instructions
            .contains("Lexora Buddy context pack"));
        assert!(prepared
            .runtime_instructions
            .contains("Buddy context pack 必须展示文件路径和行号"));
        assert!(prepared.runtime_instructions.contains("global/MEMORY.md"));
        assert_eq!(prepared.context_pack_diagnostic.source_memory_ids.len(), 0);
        assert_eq!(prepared.context_pack_diagnostic.retrieved_memory.len(), 1);
        assert_eq!(
            prepared.context_pack_diagnostic.retrieved_memory[0].source_kind,
            "buddy_memory_file"
        );
        assert_eq!(
            prepared.context_pack_diagnostic.retrieved_memory[0].path,
            accepted.source_ref.relative_path
        );
        assert_eq!(
            prepared.context_pack_diagnostic.retrieved_memory[0].line_start,
            accepted.source_ref.line_start
        );

        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    }

    #[test]
    fn context_pack_includes_selected_context_items() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let memory_root = create_buddy_test_dir("lexora-buddy-context-selected-context");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Selected context".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id.clone(),
            })
            .expect("create run");
        let selected_context = vec![BuddyContextPackSelectedContextItem {
            description: Some("处理 Buddy 本地运行时".to_owned()),
            kind: "skill".to_owned(),
            label: "lexora-buddy".to_owned(),
            path: Some("/tmp/skills/lexora-buddy/SKILL.md".to_owned()),
        }];
        let decision = intent::default_agent_task_decision(Some("/tmp"));
        let target = BuddyCodexRunTarget::session(session.id);

        let prepared = prepare_codex_run_context(
            &storage,
            &memory_root,
            &run.id,
            &target,
            "/tmp",
            "继续",
            None,
            &decision,
            &selected_context,
        )
        .expect("prepare context");

        assert!(prepared.runtime_instructions.contains("Selected context"));
        assert!(prepared
            .runtime_instructions
            .contains("skill: lexora-buddy"));
        assert!(prepared
            .runtime_instructions
            .contains("/tmp/skills/lexora-buddy/SKILL.md"));
        assert_eq!(
            prepared.context_pack_diagnostic.selected_context.items[0].label,
            "lexora-buddy"
        );

        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    }

    #[test]
    fn context_pack_excludes_other_project_private_memory_refs() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let memory_root = create_buddy_test_dir("lexora-buddy-context-project-memory");
        let project_a = create_buddy_test_dir("lexora-buddy-context-project-a");
        let project_b = create_buddy_test_dir("lexora-buddy-context-project-b");
        let project_a_id = project_a.to_string_lossy().into_owned();
        let project_b_id = project_b.to_string_lossy().into_owned();
        storage
            .upsert_project(UpsertBuddyProjectRequest {
                name: Some("Project A".to_owned()),
                root: project_a_id.clone(),
            })
            .expect("authorize project a");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: Some(project_a_id.clone()),
                scope: "project".to_owned(),
                title: Some("Project context".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some(project_a_id.clone()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id.clone(),
            })
            .expect("create run");
        let candidate_a = storage
            .create_memory_candidate(CreateBuddyMemoryCandidateRequest {
                candidate_type: "project.fact".to_owned(),
                confidence: 0.9,
                content: "PROJECT_A_ONLY_CONTEXT_MEMORY".to_owned(),
                conversation_id: None,
                decision: "accepted".to_owned(),
                eligibility: serde_json::json!({ "retrieval": true }),
                project_id: Some(project_a_id.clone()),
                reason: "project a context".to_owned(),
                run_id: Some(run.id.clone()),
                scope: "project-private".to_owned(),
                source_event_id: Some("project-a-event".to_owned()),
                source_log_path: "runs/project-a.jsonl".to_owned(),
                source_refs: serde_json::json!([]),
            })
            .expect("create project a candidate");
        let candidate_b = storage
            .create_memory_candidate(CreateBuddyMemoryCandidateRequest {
                candidate_type: "project.fact".to_owned(),
                confidence: 0.9,
                content: "PROJECT_B_MUST_NOT_LEAK_CONTEXT_MEMORY".to_owned(),
                conversation_id: None,
                decision: "accepted".to_owned(),
                eligibility: serde_json::json!({ "retrieval": true }),
                project_id: Some(project_b_id.clone()),
                reason: "project b context".to_owned(),
                run_id: Some(run.id.clone()),
                scope: "project-private".to_owned(),
                source_event_id: Some("project-b-event".to_owned()),
                source_log_path: "runs/project-b.jsonl".to_owned(),
                source_refs: serde_json::json!([]),
            })
            .expect("create project b candidate");
        crate::memory::candidates::accept_memory_candidate(&storage, &memory_root, &candidate_a.id)
            .expect("accept project a candidate");
        crate::memory::candidates::accept_memory_candidate(&storage, &memory_root, &candidate_b.id)
            .expect("accept project b candidate");
        let decision = intent::default_agent_task_decision(Some(project_a_id.as_str()));
        let target = BuddyCodexRunTarget::session(session.id);

        let prepared = prepare_codex_run_context(
            &storage,
            &memory_root,
            &run.id,
            &target,
            project_a_id.as_str(),
            "检查项目 A",
            Some(project_a_id.as_str()),
            &decision,
            &[],
        )
        .expect("prepare project context");

        assert!(prepared
            .runtime_instructions
            .contains("PROJECT_A_ONLY_CONTEXT_MEMORY"));
        assert!(!prepared
            .runtime_instructions
            .contains("PROJECT_B_MUST_NOT_LEAK_CONTEXT_MEMORY"));
        assert_eq!(prepared.context_pack_diagnostic.retrieved_memory.len(), 1);
        assert_eq!(
            prepared.context_pack_diagnostic.retrieved_memory[0]
                .project_id
                .as_deref(),
            Some(project_a_id.as_str())
        );

        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
        fs::remove_dir_all(&project_a).expect("cleanup project a");
        fs::remove_dir_all(&project_b).expect("cleanup project b");
    }

    #[test]
    fn completed_codex_turn_auto_applies_memory_workspace_without_review_queue() {
        let memory_root = create_buddy_test_dir("lexora-buddy-auto-applied-memory");
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");
        let run = storage
            .finish_run(
                run.id,
                "completed".to_owned(),
                "run.completed".to_owned(),
                serde_json::json!({ "status": "ok" }),
            )
            .expect("finish run")
            .run;
        let decision = intent::default_agent_task_decision(Some("/tmp"));

        record_codex_chat_turn_memory(
            &storage,
            &memory_root,
            &run,
            "用户要求记住 LEGACY_DIRECT_MEMORY_WRITE",
            "已处理",
            None,
            &decision,
        );

        let pending_candidates = storage
            .list_memory_candidates(Some("pending".to_owned()), 10)
            .expect("list memory candidates");
        let accepted_candidates = storage
            .list_memory_candidates(Some("accepted".to_owned()), 10)
            .expect("list accepted memory candidates");

        assert!(pending_candidates.is_empty());
        assert_eq!(accepted_candidates.len(), 1);
        assert_eq!(
            accepted_candidates[0].run_id.as_deref(),
            Some(run.id.as_str())
        );
        assert_eq!(
            accepted_candidates[0].candidate_type,
            "continuity.chat_turn"
        );
        assert_eq!(accepted_candidates[0].decision, "accepted");
        assert!(accepted_candidates[0]
            .content
            .contains("LEGACY_DIRECT_MEMORY_WRITE"));
        assert!(storage
            .search_memory_items("LEGACY_DIRECT_MEMORY_WRITE", None, 10)
            .expect("search memory")
            .is_empty());
        let source_refs = storage
            .list_memory_source_refs(accepted_candidates[0].id.clone())
            .expect("list memory source refs");
        let memory = fs::read_to_string(memory_root.join("global/MEMORY.md"))
            .expect("read auto-applied memory");

        assert_eq!(source_refs.len(), 1);
        assert_eq!(source_refs[0].source_kind, "buddy_memory_file");
        assert!(memory.contains("LEGACY_DIRECT_MEMORY_WRITE"));

        let run_events = storage
            .list_run_events(run.id.clone(), None, 10)
            .expect("list run events");
        let memory_candidate_events = run_events
            .iter()
            .filter(|event| event.event_type == "memory.candidate.created")
            .collect::<Vec<_>>();

        assert_eq!(memory_candidate_events.len(), 1);
        assert_eq!(
            memory_candidate_events[0].payload["candidateType"],
            "continuity.chat_turn"
        );
        assert_eq!(
            memory_candidate_events[0].payload["sourceEventId"],
            accepted_candidates[0].source_event_id.as_deref().unwrap()
        );
        assert_eq!(
            memory_candidate_events[0].payload["sourceRefs"][0]["sourceKind"],
            "run_log"
        );

        fs::remove_dir_all(&memory_root).expect("cleanup memory root");
    }

    #[test]
    fn completed_codex_turn_with_secret_disables_memory_candidate_without_copying_secret() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Secret memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");
        let run = storage
            .finish_run(
                run.id,
                "completed".to_owned(),
                "run.completed".to_owned(),
                serde_json::json!({ "status": "ok" }),
            )
            .expect("finish run")
            .run;
        let decision = intent::default_agent_task_decision(Some("/tmp"));

        record_codex_chat_turn_memory(
            &storage,
            Path::new("/tmp"),
            &run,
            "请帮我检查 OPENAI_API_KEY=sk-secret-value-1234567890abcdef",
            "已经说明不要把 token 写入长期记忆。",
            None,
            &decision,
        );

        let candidates = storage
            .list_memory_candidates(None, 10)
            .expect("list candidates");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].decision, "disabled");
        assert_eq!(
            candidates[0].eligibility["reasons"][0],
            "sensitive_content_detected"
        );
        assert!(!candidates[0].content.contains("sk-secret-value"));
        assert!(!candidates[0].content.contains("OPENAI_API_KEY"));
        assert!(candidates[0].content.contains("敏感内容"));
    }

    #[test]
    fn completed_codex_error_response_does_not_create_memory_candidate() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Error memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");
        let run = storage
            .finish_run(
                run.id,
                "completed".to_owned(),
                "run.completed".to_owned(),
                serde_json::json!({ "status": "ok" }),
            )
            .expect("finish run")
            .run;
        let decision = intent::default_agent_task_decision(Some("/tmp"));

        record_codex_chat_turn_memory(
            &storage,
            Path::new("/tmp"),
            &run,
            "继续刚才的问题",
            "Codex 运行失败：runtime returned an error before producing a final answer.",
            None,
            &decision,
        );

        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list candidates")
            .is_empty());
    }

    #[test]
    fn runtime_error_disables_durable_memory_candidate() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Runtime error memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");

        record_codex_runtime_error_state(
            &storage,
            &run.id,
            None,
            "codex-app-server",
            None,
            &BuddyRunStateEventPublisher::disabled(),
            "server overloaded",
        )
        .expect("record runtime error");

        let failed_run = storage.find_run(run.id.clone()).expect("find failed run");
        let run_events = storage
            .list_run_events(run.id, None, 10)
            .expect("list run events");
        let failed_event = run_events
            .iter()
            .find(|event| event.event_type == "run.failed")
            .expect("run failed event");

        assert_eq!(failed_run.status, "failed");
        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list candidates")
            .is_empty());
        assert_eq!(
            failed_event.payload["memoryEligibility"]["candidateGeneration"],
            false
        );
        assert_eq!(
            failed_event.payload["memoryEligibility"]["durableWrite"],
            false
        );
        assert_eq!(
            failed_event.payload["memoryEligibility"]["retrieval"],
            false
        );
        assert_eq!(
            failed_event.payload["memoryEligibility"]["reasons"][0],
            "runtime_error"
        );
    }

    #[test]
    fn queued_codex_turn_does_not_create_memory_candidate() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Queued memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");
        let decision = intent::default_agent_task_decision(Some("/tmp"));

        record_codex_chat_turn_memory(
            &storage,
            Path::new("/tmp"),
            &run,
            "用户要求记住 QUEUED_DIRECT_MEMORY_WRITE",
            "还没有完成",
            None,
            &decision,
        );

        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list candidates")
            .is_empty());
    }

    #[test]
    fn attachment_task_does_not_create_memory_candidate_after_completed_turn() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Attachment memory gate".to_owned()),
            })
            .expect("create session");
        let run = storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run");
        let run = storage
            .finish_run(
                run.id,
                "completed".to_owned(),
                "run.completed".to_owned(),
                serde_json::json!({ "status": "ok" }),
            )
            .expect("finish run")
            .run;
        let decision = intent::classify_buddy_intent(BuddyIntentClassificationInput {
            content: "分析附件",
            cwd: Some("/tmp"),
            has_attachments: true,
            has_context_items: false,
            has_project_scope: false,
            has_structured_inputs: false,
        });

        record_codex_chat_turn_memory(
            &storage,
            Path::new("/tmp"),
            &run,
            "分析附件\nATTACHMENT_ONLY_SECRET_TOKEN",
            "已处理附件",
            Some("/tmp".to_owned()),
            &decision,
        );

        assert!(storage
            .list_memory_candidates(None, 10)
            .expect("list candidates")
            .is_empty());
        assert!(storage
            .search_memory_items("ATTACHMENT_ONLY_SECRET_TOKEN", Some("/tmp"), 10)
            .expect("search memory")
            .is_empty());
    }

    #[test]
    fn rejects_project_agent_turn_when_requested_cwd_belongs_to_another_project() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-agent-cwd");
        let data_dir = temp_dir.join("data");
        let project_a = temp_dir.join("project-a");
        let project_b = temp_dir.join("project-b");
        fs::create_dir_all(&project_a).expect("create project a");
        fs::create_dir_all(&project_b).expect("create project b");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
                .expect("initialize state");
        let project_a = state
            .upsert_project(crate::storage::UpsertBuddyProjectRequest {
                name: Some("Project A".to_owned()),
                root: project_a.to_string_lossy().into_owned(),
            })
            .expect("authorize project a");
        let project_b = state
            .upsert_project(crate::storage::UpsertBuddyProjectRequest {
                name: Some("Project B".to_owned()),
                root: project_b.to_string_lossy().into_owned(),
            })
            .expect("authorize project b");

        let error = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "check workspace".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: Some(project_a.root),
                    scope: "project".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("Project A".to_owned()),
                }),
                cwd: Some(project_b.root),
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .err()
        .expect("reject mismatched project cwd");

        assert!(error
            .to_string()
            .contains("conversation project root does not match requested cwd"));
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn completed_buddy_agent_turn_binds_assistant_message_to_run() {
        let storage = BuddyStorage::new_temporary_for_test().expect("create storage");
        let conversation = storage
            .create_conversation(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Agent turn".to_owned()),
            })
            .expect("create conversation");
        let user_message = storage
            .append_conversation_message(AppendBuddyConversationMessageRequest {
                attachments: Vec::new(),
                branch_id: conversation.active_branch_id.clone(),
                content: "你好".to_owned(),
                conversation_id: conversation.id.clone(),
                parent_message_id: None,
                role: "user".to_owned(),
                run_id: None,
                version_group_id: None,
                version_index: 1,
                version_status: "active".to_owned(),
            })
            .expect("append user message");
        let mut run = storage
            .create_conversation_run(CreateBuddyConversationRunRequest {
                runtime: "codex".to_owned(),
                branch_id: conversation.active_branch_id.clone(),
                conversation_id: conversation.id.clone(),
                cwd: Some("/tmp".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                intent: "buddy.agent.turn".to_owned(),
                triggering_message_id: user_message.id.clone(),
            })
            .expect("create conversation run");
        let target = BuddyCodexRunTarget::conversation(
            conversation.id.clone(),
            conversation.active_branch_id.clone(),
            user_message.id.clone(),
        );
        let runtime_output = CodexRuntimeOutput {
            final_memory_citation: None,
            final_message: "完成".to_owned(),
            protocol: "codex_exec_json_fallback",
            stdout_bytes: Some(6),
            thread_id: None,
            turn_id: None,
        };
        let mut events = Vec::new();

        let assistant_message = persist_completed_codex_run(
            &storage,
            &mut run,
            &mut events,
            &target,
            None,
            &runtime_output,
            "完成",
        )
        .expect("persist assistant message");

        assert_eq!(
            assistant_message.conversation_id.as_deref(),
            Some(conversation.id.as_str())
        );
        assert_eq!(
            assistant_message.branch_id.as_deref(),
            Some(conversation.active_branch_id.as_str())
        );
        assert_eq!(assistant_message.run_id.as_deref(), Some(run.id.as_str()));
        assert_eq!(
            assistant_message.parent_message_id.as_deref(),
            Some(user_message.id.as_str())
        );
        assert_eq!(assistant_message.version_index, Some(1));
        assert_eq!(assistant_message.version_status.as_deref(), Some("active"));
        assert_eq!(run.status, "completed");
        assert!(events
            .iter()
            .any(|event| event.event_type == "message.completed"));

        let conversation_log_lines = storage.read_local_log_lines_for_test(&conversation.log_path);
        let assistant_log = conversation_log_lines
            .iter()
            .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .find(|line| {
                line["type"] == "message.created"
                    && line["payload"]["role"] == "assistant"
                    && line["payload"]["runId"] == run.id
            })
            .expect("assistant message log line");
        assert_eq!(assistant_log["payload"]["versionStatus"], "active");
    }

    fn read_jsonl_events(lines: &[String]) -> Vec<serde_json::Value> {
        lines
            .iter()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("jsonl line"))
            .collect()
    }

    #[test]
    fn rejects_global_conversation_agent_turn_with_project_cwd() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-global-conversation-project-cwd");
        let data_dir = temp_dir.join("data");
        let project_root = temp_dir.join("project");
        fs::create_dir_all(&project_root).expect("create project");
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(data_dir.clone()))
                .expect("initialize state");
        let project = state
            .upsert_project(crate::storage::UpsertBuddyProjectRequest {
                name: Some("Project".to_owned()),
                root: project_root.to_string_lossy().into_owned(),
            })
            .expect("authorize project");
        let conversation = state
            .create_conversation(CreateBuddyConversationRequest {
                forked_from_message_id: None,
                project_root: None,
                scope: "global".to_owned(),
                source_conversation_id: None,
                source_run_id: None,
                title: Some("Global".to_owned()),
            })
            .expect("create global conversation");

        let error = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "check workspace".to_owned(),
                context_items: Vec::new(),
                conversation_id: Some(conversation.id),
                conversation_seed: None,
                cwd: Some(project.root),
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .err()
        .expect("reject project cwd for global conversation");

        assert!(error
            .to_string()
            .contains("global conversation cannot run in a project cwd"));
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn appends_buddy_builtin_animation_skill_to_codex_inputs() {
        let input = compose_buddy_chat_codex_inputs(
            "写一篇文章",
            Vec::new(),
            &[],
            Some(TrustedCodexSkillInput {
                name: "lexora-buddy-animation".to_owned(),
                path: "/tmp/lexora-buddy-animation/SKILL.md".to_owned(),
            }),
        )
        .expect("compose inputs");

        assert!(input.iter().any(|item| matches!(
            item,
            codex::CodexUserInput::Skill { name, path }
                if name == "lexora-buddy-animation"
                    && path == "/tmp/lexora-buddy-animation/SKILL.md"
        )));
    }

    #[test]
    fn sanitizes_frontend_supplied_codex_inputs_before_runtime_execution() {
        let input = compose_buddy_chat_codex_inputs(
            "真实 runtime 内容",
            vec![
                codex::CodexUserInput::Text {
                    text: "前端原始内容".to_owned(),
                    text_elements: vec![codex::CodexTextElement {
                        byte_range: codex::CodexByteRange { start: 0, end: 12 },
                        placeholder: Some("[File #1]".to_owned()),
                    }],
                },
                codex::CodexUserInput::LocalImage {
                    detail: Some("high".to_owned()),
                    path: "/home/user/secret.png".to_owned(),
                },
                codex::CodexUserInput::Skill {
                    name: "external".to_owned(),
                    path: "/home/user/.codex/skills/external/SKILL.md".to_owned(),
                },
                codex::CodexUserInput::Mention {
                    name: "secret".to_owned(),
                    path: "/home/user/secret.md".to_owned(),
                },
                codex::CodexUserInput::Image {
                    detail: None,
                    url: "data:image/png;base64,cG5n".to_owned(),
                },
            ],
            &[],
            None,
        )
        .expect("compose inputs");

        assert!(input.iter().any(|item| matches!(
            item,
            codex::CodexUserInput::Text { text, text_elements }
                if text == "真实 runtime 内容" && text_elements.is_empty()
        )));
        assert!(input
            .iter()
            .any(|item| matches!(item, codex::CodexUserInput::Image { url, .. } if url == "data:image/png;base64,cG5n")));
        assert!(!input.iter().any(|item| matches!(
            item,
            codex::CodexUserInput::LocalImage { .. }
                | codex::CodexUserInput::Skill { .. }
                | codex::CodexUserInput::Mention { .. }
        )));
    }

    #[test]
    fn composes_registered_image_attachment_from_preview_path() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let image_path = dir.join("registered.png");
        fs::write(&image_path, b"png").expect("write image");
        let attachments = vec![BuddyChatAttachment {
            attachment_id: None,
            data_url: None,
            kind: "image".to_owned(),
            mime_type: "image/png".to_owned(),
            name: "registered.png".to_owned(),
            preview_path: Some(image_path.to_string_lossy().into_owned()),
            size_bytes: 3,
            text: None,
        }];

        let input = compose_buddy_chat_codex_inputs("看图", Vec::new(), &attachments, None)
            .expect("compose inputs");

        assert!(input.iter().any(|item| matches!(
            item,
            codex::CodexUserInput::Image { url, .. }
                if url == "data:image/png;base64,cG5n"
        )));
        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }

    #[test]
    fn agent_turn_plan_materializes_and_injects_buddy_builtin_animation_skill() {
        let temp_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-plan-animation-skill-{}",
            uuid::Uuid::new_v4()
        ));
        let state =
            BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(temp_dir.clone()))
                .expect("initialize state");

        let plan = create_buddy_agent_turn_plan(
            &state,
            StartBuddyAgentTurnRequest {
                attachments: Vec::new(),
                content: "写一篇文章".to_owned(),
                context_items: Vec::new(),
                conversation_id: None,
                conversation_seed: Some(CreateBuddyConversationRequest {
                    forked_from_message_id: None,
                    project_root: None,
                    scope: "global".to_owned(),
                    source_conversation_id: None,
                    source_run_id: None,
                    title: Some("测试对话".to_owned()),
                }),
                cwd: None,
                inputs: Vec::new(),
                model_selection: None,
            },
        )
        .expect("create plan");

        let skill_path = plan
            .runtime_inputs
            .iter()
            .find_map(|input| match input {
                codex::CodexUserInput::Skill { name, path } if name == "lexora-buddy-animation" => {
                    Some(path)
                }
                _ => None,
            })
            .expect("builtin animation skill input");
        assert!(skill_path.starts_with(temp_dir.to_string_lossy().as_ref()));
        assert!(std::fs::read_to_string(skill_path)
            .expect("read skill")
            .contains("Lexora Buddy animation is host UI state"));

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn composes_user_and_runtime_content_with_codex_context_items() {
        let context_items = vec![
            BuddyChatPromptContextItem {
                description: Some("先拆计划再执行".to_owned()),
                kind: "slashCommand".to_owned(),
                label: "/plan".to_owned(),
                path: None,
                value: "/plan".to_owned(),
            },
            BuddyChatPromptContextItem {
                description: Some("处理 Lexora 桌面端本地运行时".to_owned()),
                kind: "skill".to_owned(),
                label: "lexora-buddy".to_owned(),
                path: Some("/tmp/lexora-buddy/SKILL.md".to_owned()),
                value: "lexora-buddy".to_owned(),
            },
            BuddyChatPromptContextItem {
                description: Some("Control the in-app browser".to_owned()),
                kind: "plugin".to_owned(),
                label: "Browser".to_owned(),
                path: None,
                value: "browser".to_owned(),
            },
            BuddyChatPromptContextItem {
                description: None,
                kind: "file".to_owned(),
                label: "apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
                path: Some("/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue".to_owned()),
                value: "apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
            },
        ];

        let user_content =
            compose_buddy_chat_user_message_content("检查输入框", &[], &context_items);
        let runtime_content = compose_buddy_chat_runtime_content("检查输入框", &[], &context_items);

        assert!(user_content.contains(
            "上下文：/plan; $lexora-buddy; @Browser; @apps/buddy/src/chat/BuddyChatComposer.vue"
        ));
        assert!(runtime_content.contains("Codex prompt context selected in Lexora"));
        assert!(runtime_content.contains("- Slash command /plan: 先拆计划再执行"));
        assert!(runtime_content.contains("- Skill $lexora-buddy: 处理 Lexora 桌面端本地运行时"));
        assert!(runtime_content.contains("- Plugin @browser (Browser): Control the in-app browser"));
        assert!(runtime_content
            .contains("- File @/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue"));
    }

    #[test]
    fn keeps_user_visible_content_free_of_attachment_echo() {
        let attachments = vec![BuddyChatAttachment {
            attachment_id: None,
            kind: "image".to_owned(),
            name: "ig_098b501d3c0430.png".to_owned(),
            mime_type: "image/png".to_owned(),
            size_bytes: 1_800_000,
            data_url: Some("data:image/png;base64,AA==".to_owned()),
            preview_path: None,
            text: None,
        }];

        let user_content = compose_buddy_chat_user_message_content(
            "测试 [Image #1] 行内图片引用",
            &attachments,
            &[],
        );
        let runtime_content =
            compose_buddy_chat_runtime_content("测试 [Image #1] 行内图片引用", &attachments, &[]);

        assert_eq!(user_content, "测试 行内图片引用");
        assert!(!user_content.contains("Image #1"));
        assert!(!user_content.contains("ig_098b501d3c0430.png"));
        assert!(runtime_content.contains("测试 [Image #1] 行内图片引用"));
    }

    #[test]
    fn keeps_user_visible_content_free_of_text_file_attachment_echo() {
        let attachments = vec![BuddyChatAttachment {
            attachment_id: None,
            kind: "text".to_owned(),
            name: "note.txt".to_owned(),
            mime_type: "text/plain".to_owned(),
            size_bytes: 5,
            data_url: None,
            preview_path: None,
            text: Some("hello".to_owned()),
        }];

        let user_content =
            compose_buddy_chat_user_message_content("总结 [File #1]", &attachments, &[]);
        let runtime_content =
            compose_buddy_chat_runtime_content("总结 [File #1]", &attachments, &[]);

        assert_eq!(user_content, "总结");
        assert!(runtime_content.contains("总结 [File #1]"));
        assert!(runtime_content.contains("Uploaded text file: note.txt"));
    }
    fn create_codex_app_server_approval_request(
        method: &str,
        mut params: serde_json::Value,
    ) -> codex::CodexAppServerApprovalRequest {
        let params_object = params.as_object_mut().expect("params object");
        params_object
            .entry("itemId")
            .or_insert_with(|| serde_json::json!("approval-item"));
        params_object
            .entry("threadId")
            .or_insert_with(|| serde_json::json!("thread-1"));
        params_object
            .entry("turnId")
            .or_insert_with(|| serde_json::json!("turn-1"));

        codex::CodexAppServerApprovalRequest {
            item_id: "approval-item".to_owned(),
            method: method.to_owned(),
            params,
            request_id: 41,
            thread_id: "thread-1".to_owned(),
            turn_id: "turn-1".to_owned(),
        }
    }

    fn create_codex_approval_test_storage() -> BuddyStorage {
        BuddyStorage::new_temporary_for_test().expect("create storage")
    }

    fn create_codex_approval_test_run(storage: &BuddyStorage) -> crate::storage::BuddyRun {
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Codex approval scope".to_owned()),
            })
            .expect("create session");

        storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp/lexora-project".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run")
    }

    fn create_buddy_test_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
