use tauri::State;

use crate::{
    error::BuddyResult,
    state::BuddyAppState,
    storage::{
        BuddyChatRunEvent, BuddyRun, BuddyRunEvent, BuddyRunEventCount, BuddyRunEventSummary,
        BuddyStorage,
    },
};

use super::{run_buddy_blocking, BuddyCommandResult};

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

fn hydrate_memory_context_pack_events(
    _storage: &BuddyStorage,
    events: Vec<BuddyRunEvent>,
) -> BuddyResult<Vec<BuddyRunEvent>> {
    Ok(events)
}
