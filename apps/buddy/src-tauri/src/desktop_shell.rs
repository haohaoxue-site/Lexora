use std::{
    collections::HashMap,
    fs,
    process::Command,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, Runtime, WebviewWindow, Window, WindowEvent,
};

use crate::{
    error::{BuddyError, BuddyResult},
    native_pet::{self, NativePetSidecarEvent},
};

pub const BUDDY_PANEL_WINDOW_LABEL: &str = "panel";
pub const BUDDY_CHAT_WINDOW_LABEL: &str = "chat";

const TRAY_OPEN_PANEL_ID: &str = "buddy-open-panel";
const TRAY_OPEN_CHAT_ID: &str = "buddy-open-chat";
const TRAY_QUIT_ID: &str = "buddy-quit";
const TEMPORARY_FRONT_RAISE_DURATION: Duration = Duration::from_millis(220);
const KWIN_SCRIPTING_SERVICE: &str = "org.kde.KWin";
const KWIN_SCRIPTING_PATH: &str = "/Scripting";
const KWIN_SCRIPTING_LOAD_SCRIPT_METHOD: &str = "org.kde.kwin.Scripting.loadScript";
const KWIN_SCRIPTING_START_METHOD: &str = "org.kde.kwin.Scripting.start";
const KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD: &str = "org.kde.kwin.Scripting.unloadScript";

static WINDOW_ALWAYS_ON_TOP_STATES: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

pub fn setup_desktop_shell<R: Runtime>(app: &App<R>) -> BuddyResult<()> {
    prepare_initial_windows(app.handle())?;
    let app_handle = app.handle().clone();
    let pet_process = native_pet::spawn_native_pet_sidecar(move |event| match event {
        NativePetSidecarEvent::OpenChat => {
            let _ = show_chat(&app_handle);
        }
    })?;
    app.manage(pet_process);
    create_tray(app)?;
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };

    if !is_resident_window_label(window.label()) {
        return;
    }

    api.prevent_close();
    let _ = window.hide();
}

pub fn is_resident_window_label(label: &str) -> bool {
    matches!(label, BUDDY_PANEL_WINDOW_LABEL | BUDDY_CHAT_WINDOW_LABEL)
}

pub fn show_panel<R: Runtime>(app: &AppHandle<R>) -> BuddyResult<()> {
    show_window(app, BUDDY_PANEL_WINDOW_LABEL, true, false)
}

pub fn show_chat<R: Runtime>(app: &AppHandle<R>) -> BuddyResult<()> {
    show_window(app, BUDDY_CHAT_WINDOW_LABEL, true, true)
}

pub fn hide_current_window<R: Runtime>(window: &Window<R>) -> BuddyResult<()> {
    window
        .hide()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

pub fn set_window_always_on_top<R: Runtime>(
    window: &Window<R>,
    always_on_top: bool,
) -> BuddyResult<()> {
    set_window_always_on_top_platform_state(
        window.title().unwrap_or_else(|_| window.label().to_owned()),
        always_on_top,
        |state| window.set_always_on_top(state),
    )?;
    remember_window_always_on_top(window.label(), always_on_top);
    Ok(())
}

fn set_window_always_on_top_platform_state(
    title: String,
    always_on_top: bool,
    set_tauri_always_on_top: impl FnOnce(bool) -> Result<(), tauri::Error>,
) -> BuddyResult<()> {
    let tauri_result = set_tauri_always_on_top(always_on_top)
        .map_err(|error| BuddyError::Runtime(error.to_string()));
    let kwin_result = set_kwin_window_keep_above(std::process::id(), &title, always_on_top);

    if should_require_kwin_window_layer_sync() {
        if let Err(error) = &kwin_result {
            eprintln!("Lexora KWin window layer sync failed: {error}");
        }

        return kwin_result;
    }

    if kwin_result.is_ok() || tauri_result.is_ok() {
        return Ok(());
    }

    Err(tauri_result.err().unwrap_or_else(|| {
        kwin_result
            .err()
            .unwrap_or_else(|| BuddyError::Runtime("failed to update window layer".to_owned()))
    }))
}

pub fn window_is_always_on_top<R: Runtime>(window: &Window<R>) -> BuddyResult<bool> {
    window_always_on_top_state(window.label(), window.is_always_on_top())
}

fn webview_window_is_always_on_top<R: Runtime>(window: &WebviewWindow<R>) -> BuddyResult<bool> {
    window_always_on_top_state(window.label(), window.is_always_on_top())
}

fn window_always_on_top_state(
    label: &str,
    runtime_state: Result<bool, tauri::Error>,
) -> BuddyResult<bool> {
    if let Some(always_on_top) = remembered_window_always_on_top(label) {
        return Ok(always_on_top);
    }

    runtime_state.map_err(|error| BuddyError::Runtime(error.to_string()))
}

fn prepare_initial_windows<R: Runtime>(app: &AppHandle<R>) -> BuddyResult<()> {
    let default_icon = app.default_window_icon().cloned();

    if let Some(panel_window) = app.get_webview_window(BUDDY_PANEL_WINDOW_LABEL) {
        apply_default_window_icon(&panel_window, default_icon.as_ref())?;
        let _ = panel_window.hide();
    }

    if let Some(chat_window) = app.get_webview_window(BUDDY_CHAT_WINDOW_LABEL) {
        apply_default_window_icon(&chat_window, default_icon.as_ref())?;
        let _ = chat_window.hide();
    }

    Ok(())
}

fn apply_default_window_icon<R: Runtime>(
    window: &WebviewWindow<R>,
    icon: Option<&tauri::image::Image<'_>>,
) -> BuddyResult<()> {
    if let Some(icon) = icon {
        window.set_icon(icon.clone()).map_err(to_runtime_error)?;
    }

    Ok(())
}

fn create_tray<R: Runtime>(app: &App<R>) -> BuddyResult<()> {
    let open_panel = MenuItem::with_id(app, TRAY_OPEN_PANEL_ID, "打开控制面板", true, None::<&str>)
        .map_err(to_runtime_error)?;
    let open_chat = MenuItem::with_id(app, TRAY_OPEN_CHAT_ID, "打开对话", true, None::<&str>)
        .map_err(to_runtime_error)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)
        .map_err(to_runtime_error)?;
    let separator = PredefinedMenuItem::separator(app).map_err(to_runtime_error)?;
    let menu = Menu::with_items(app, &[&open_chat, &open_panel, &separator, &quit])
        .map_err(to_runtime_error)?;

    let mut tray = TrayIconBuilder::with_id("lexora-buddy")
        .menu(&menu)
        .tooltip("Lexora")
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_PANEL_ID => {
                let _ = show_panel(app);
            }
            TRAY_OPEN_CHAT_ID => {
                let _ = show_chat(app);
            }
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app).map_err(to_runtime_error)?;

    Ok(())
}

fn show_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    focus: bool,
    temporarily_raise: bool,
) -> BuddyResult<()> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| BuddyError::Runtime(format!("{label} window was not created")))?;

    window.show().map_err(to_runtime_error)?;
    let _ = window.unminimize();

    if focus {
        if temporarily_raise {
            temporarily_raise_window_to_front(&window);
        }

        let _ = window.set_focus();
    }

    Ok(())
}

fn temporarily_raise_window_to_front<R: Runtime>(window: &WebviewWindow<R>) {
    if !matches!(webview_window_is_always_on_top(window), Ok(false)) {
        return;
    }

    if set_window_always_on_top_platform_state(
        window.title().unwrap_or_else(|_| window.label().to_owned()),
        true,
        |state| window.set_always_on_top(state),
    )
    .is_err()
    {
        return;
    }

    let window = window.clone();
    tauri::async_runtime::spawn_blocking(move || {
        thread::sleep(TEMPORARY_FRONT_RAISE_DURATION);
        if remembered_window_always_on_top(window.label()) == Some(true) {
            return;
        }

        let _ = set_window_always_on_top_platform_state(
            window.title().unwrap_or_else(|_| window.label().to_owned()),
            false,
            |state| window.set_always_on_top(state),
        );
    });
}

fn to_runtime_error(error: tauri::Error) -> BuddyError {
    BuddyError::Runtime(error.to_string())
}

fn remember_window_always_on_top(label: &str, always_on_top: bool) {
    if let Ok(mut states) = window_always_on_top_states().lock() {
        states.insert(label.to_owned(), always_on_top);
    }
}

fn remembered_window_always_on_top(label: &str) -> Option<bool> {
    window_always_on_top_states()
        .lock()
        .ok()
        .and_then(|states| states.get(label).copied())
}

fn window_always_on_top_states() -> &'static Mutex<HashMap<String, bool>> {
    WINDOW_ALWAYS_ON_TOP_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn set_kwin_window_keep_above(pid: u32, title: &str, keep_above: bool) -> BuddyResult<()> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let plugin_name = format!("lexora-buddy-keep-above-{pid}-{nonce}");
    let script_path = std::env::temp_dir().join(format!("{plugin_name}.js"));
    fs::write(
        &script_path,
        create_kwin_keep_above_script(pid, title, keep_above)?,
    )
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    let result = run_kwin_script(&script_path, &plugin_name);
    let _ = fs::remove_file(&script_path);
    result
}

fn create_kwin_keep_above_script(pid: u32, title: &str, keep_above: bool) -> BuddyResult<String> {
    let title = serde_json::to_string(title)?;
    let keep_above = if keep_above { "true" } else { "false" };

    Ok(format!(
        r#"const targetPid = {pid};
const targetTitle = {title};
const keepAbove = {keep_above};

function windows() {{
  if (workspace.windowList)
    return workspace.windowList();
  if (workspace.clientList)
    return workspace.clientList();
  return [];
}}

function matches(window) {{
  if (!window)
    return false;
  const caption = String(window.caption || window.captionNormal || "");
  const captionNormal = String(window.captionNormal || "");
  const pidMatches = Number(window.pid) === targetPid;
  const titleMatches = caption === targetTitle || captionNormal === targetTitle;
  return pidMatches && titleMatches;
}}

let target = matches(workspace.activeWindow) ? workspace.activeWindow : null;
if (!target) {{
  const candidates = windows();
  for (let index = 0; index < candidates.length; index += 1) {{
    if (matches(candidates[index])) {{
      target = candidates[index];
      break;
    }}
  }}
}}

if (target) {{
  target.keepAbove = keepAbove;
  if (keepAbove)
    workspace.activeWindow = target;
}}
"#
    ))
}

fn run_kwin_script(script_path: &std::path::Path, plugin_name: &str) -> BuddyResult<()> {
    let script_path = script_path
        .to_str()
        .ok_or_else(|| BuddyError::Runtime("KWin script path is not valid UTF-8".to_owned()))?;
    let _ = run_qdbus6([
        KWIN_SCRIPTING_SERVICE,
        KWIN_SCRIPTING_PATH,
        KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
        plugin_name,
    ]);
    run_qdbus6([
        KWIN_SCRIPTING_SERVICE,
        KWIN_SCRIPTING_PATH,
        KWIN_SCRIPTING_LOAD_SCRIPT_METHOD,
        script_path,
        plugin_name,
    ])?;
    run_qdbus6([
        KWIN_SCRIPTING_SERVICE,
        KWIN_SCRIPTING_PATH,
        KWIN_SCRIPTING_START_METHOD,
    ])?;
    let _ = run_qdbus6([
        KWIN_SCRIPTING_SERVICE,
        KWIN_SCRIPTING_PATH,
        KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
        plugin_name,
    ]);

    Ok(())
}

fn run_qdbus6<const N: usize>(args: [&str; N]) -> BuddyResult<String> {
    let mut command = Command::new(qdbus6_binary());
    if let Some(session_bus_address) = session_bus_address() {
        command.env("DBUS_SESSION_BUS_ADDRESS", session_bus_address);
    }

    let output = command
        .args(args)
        .output()
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map_err(|error| BuddyError::Runtime(error.to_string()));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    Err(BuddyError::Runtime(if stderr.is_empty() {
        "qdbus6 failed to apply KWin window state".to_owned()
    } else {
        stderr
    }))
}

fn qdbus6_binary() -> &'static str {
    if std::path::Path::new("/usr/bin/qdbus6").exists() {
        "/usr/bin/qdbus6"
    } else {
        "qdbus6"
    }
}

fn session_bus_address() -> Option<String> {
    std::env::var("DBUS_SESSION_BUS_ADDRESS")
        .ok()
        .filter(|address| !address.is_empty())
        .or_else(|| {
            std::env::var("XDG_RUNTIME_DIR")
                .ok()
                .filter(|runtime_dir| !runtime_dir.is_empty())
                .map(|runtime_dir| format!("unix:path={runtime_dir}/bus"))
        })
}

fn should_require_kwin_window_layer_sync() -> bool {
    [
        std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default(),
        std::env::var("XDG_SESSION_DESKTOP").unwrap_or_default(),
        std::env::var("DESKTOP_SESSION").unwrap_or_default(),
    ]
    .iter()
    .any(|value| {
        let value = value.to_ascii_lowercase();
        value.contains("kde") || value.contains("plasma")
    })
}

#[cfg(test)]
mod tests {
    use super::{
        create_kwin_keep_above_script, is_resident_window_label, BUDDY_CHAT_WINDOW_LABEL,
        BUDDY_PANEL_WINDOW_LABEL,
    };

    #[test]
    fn treats_panel_and_chat_as_resident_webview_windows() {
        assert!(!is_resident_window_label("pet"));
        assert!(is_resident_window_label(BUDDY_PANEL_WINDOW_LABEL));
        assert!(is_resident_window_label(BUDDY_CHAT_WINDOW_LABEL));
        assert!(!is_resident_window_label("main"));
    }

    #[test]
    fn buddy_window_capability_allows_custom_chrome_commands() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/buddy-windows.json"))
                .expect("parse buddy window capability");
        let windows = capability
            .get("windows")
            .and_then(serde_json::Value::as_array)
            .expect("capability windows");
        let permissions = capability
            .get("permissions")
            .and_then(serde_json::Value::as_array)
            .expect("capability permissions");

        for label in [BUDDY_PANEL_WINDOW_LABEL, BUDDY_CHAT_WINDOW_LABEL] {
            assert!(windows.iter().any(|window| window.as_str() == Some(label)));
        }

        for permission in [
            "core:event:allow-listen",
            "core:window:allow-is-always-on-top",
            "core:window:allow-is-maximized",
            "core:window:allow-minimize",
            "core:window:allow-set-always-on-top",
            "core:window:allow-start-dragging",
            "core:window:allow-toggle-maximize",
        ] {
            assert!(permissions
                .iter()
                .any(|candidate| candidate.as_str() == Some(permission)));
        }
    }

    #[test]
    fn kwin_keep_above_script_targets_exact_current_process_window_title() {
        let script = create_kwin_keep_above_script(42, r#"Lexora "Buddy" Chat"#, true)
            .expect("create KWin keep-above script");

        assert!(script.contains("const targetPid = 42;"));
        assert!(script.contains(r#"const targetTitle = "Lexora \"Buddy\" Chat";"#));
        assert!(script.contains(
            "const titleMatches = caption === targetTitle || captionNormal === targetTitle;"
        ));
        assert!(!script.contains("resourceClass"));
        assert!(!script.contains("resourceName"));
        assert!(script.contains("const keepAbove = true;"));
        assert!(script.contains("target.keepAbove = keepAbove;"));
    }
}
