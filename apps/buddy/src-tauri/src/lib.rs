mod agents;
mod app_config;
mod app_paths;
mod codex_smoke;
mod commands;
mod context_pack;
mod desktop_shell;
mod domain;
mod error;
mod health_check;
mod intent;
mod linux_webview;
mod memory;
mod native_pet;
mod state;
mod storage;
mod window_smoke;

use tauri::Manager;

pub use health_check::run_headless_command_from_env;
pub use native_pet::{
    run_native_pet_drag_replay_command_from_env, run_native_pet_sidecar_from_env,
    run_native_pet_smoke_command_from_env,
};
pub use window_smoke::parse_window_smoke_check_config;

use crate::{
    app_paths::BuddyAppPaths,
    error::{BuddyError, BuddyResult},
    window_smoke::{create_window_smoke_check_report, BuddyWindowSmokeCheckConfig},
};

pub use codex_smoke::run_codex_smoke_command_from_env;
pub mod local_log;
pub fn run_window_smoke_check_from_env() -> Option<BuddyResult<()>> {
    let config = parse_window_smoke_check_config(std::env::args())?;

    Some(run_window_smoke_check(config))
}

fn run_window_smoke_check(config: BuddyWindowSmokeCheckConfig) -> BuddyResult<()> {
    linux_webview::prepare_webview_environment();

    let cleanup_dir = config.cleanup_after.then(|| config.data_dir.clone());

    let result = tauri::Builder::default()
        .setup(move |app| {
            let state = state::BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(
                config.data_dir.clone(),
            ))?;
            app.manage(commands::BuddyRunCancellationRegistry::default());
            app.manage(state);

            let panel_window = app.get_webview_window(desktop_shell::BUDDY_PANEL_WINDOW_LABEL);
            if panel_window.is_none() {
                return Err(BuddyError::Runtime("panel window was not created".to_owned()).into());
            }

            let report = create_window_smoke_check_report("panel", true);
            println!("{}", serde_json::to_string(&report)?);
            app.handle().exit(0);

            Ok(())
        })
        .run(tauri::generate_context!())
        .map_err(|error| BuddyError::Runtime(error.to_string()));

    if let Some(cleanup_dir) = cleanup_dir {
        let _ = std::fs::remove_dir_all(cleanup_dir);
    }

    result
}

pub fn run() {
    linux_webview::prepare_webview_environment();

    tauri::Builder::default()
        .setup(|app| {
            let state = state::BuddyAppState::initialize(app.handle())?;
            app.manage(commands::BuddyRunCancellationRegistry::default());
            app.manage(state);
            desktop_shell::setup_desktop_shell(app)?;

            Ok(())
        })
        .on_window_event(desktop_shell::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::authorize_buddy_project_from_folder_picker,
            commands::approval::approve_buddy_codex_app_server_request_approval,
            commands::approval::approve_buddy_read_only_task,
            commands::cancel_buddy_chat_run,
            commands::control_buddy_native_pet_host_action,
            commands::run_events::count_buddy_run_events,
            commands::create_buddy_message,
            commands::create_buddy_session,
            commands::delete_buddy_conversation,
            commands::delete_buddy_session,
            commands::approval::deny_buddy_approval,
            commands::get_buddy_claude_runtime_status,
            commands::get_buddy_codex_runtime_status,
            commands::get_buddy_runtime_diagnostics,
            commands::get_buddy_app_settings,
            commands::get_buddy_current_window_frame_state,
            commands::get_buddy_local_state_status,
            commands::get_buddy_runtime_status,
            commands::run_events::get_buddy_run,
            commands::get_buddy_run_diagnostics,
            commands::get_buddy_usage_snapshot,
            commands::hide_buddy_current_window,
            commands::list_buddy_projects,
            commands::approval::list_buddy_approvals,
            commands::list_buddy_runtime_model_options,
            commands::run_events::list_buddy_chat_conversation_events,
            commands::run_events::list_buddy_chat_run_events,
            commands::run_events::list_buddy_chat_session_events,
            commands::list_buddy_conversation_messages,
            commands::run_events::list_buddy_conversation_run_events,
            commands::list_buddy_conversations,
            commands::list_buddy_messages,
            commands::list_buddy_codex_prompt_context_options,
            commands::run_events::list_buddy_run_event_summaries,
            commands::run_events::list_buddy_run_events,
            commands::run_events::list_buddy_runs,
            commands::run_events::list_buddy_session_run_events,
            commands::list_buddy_sessions,
            commands::minimize_buddy_current_window,
            commands::attachment::read_buddy_clipboard_files,
            commands::attachment::read_buddy_clipboard_image,
            commands::read_buddy_setting_json,
            commands::attachment::select_buddy_chat_attachment_files,
            commands::set_buddy_current_window_always_on_top,
            commands::set_buddy_native_pet_animation,
            commands::show_buddy_chat,
            commands::show_buddy_panel,
            commands::start_buddy_current_window_dragging,
            commands::agent_turn::start_buddy_agent_turn,
            commands::toggle_buddy_current_window_maximize,
            commands::update_buddy_app_settings,
            commands::write_buddy_setting_json
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Lexora");
}

#[cfg(test)]
mod invoke_handler_tests {
    #[test]
    fn does_not_expose_legacy_chat_message_command() {
        let source = include_str!("lib.rs");
        let legacy_command = concat!("start_", "buddy_chat_message");

        assert!(
            !source.contains(&format!("commands::{legacy_command}")),
            "legacy session chat command must not stay registered as a Tauri product entrypoint"
        );
    }
}

#[cfg(test)]
mod linux_webview_tests {
    use crate::linux_webview::resolve_webkit_disable_dmabuf_renderer;

    #[test]
    #[cfg(target_os = "linux")]
    fn disables_webkit_dmabuf_renderer_by_default_on_linux() {
        assert_eq!(resolve_webkit_disable_dmabuf_renderer(None), Some("1"));
    }

    #[test]
    fn preserves_explicit_webkit_dmabuf_renderer_override() {
        assert_eq!(resolve_webkit_disable_dmabuf_renderer(Some("0")), Some("0"));
    }
}
