use rusqlite::types::Type;
use serde_json::Value;

use super::{
    models::{BuddyChatRunEvent, BuddyRunEvent, BuddyRunEventSummary},
    projection,
};

pub(super) fn map_run_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyRunEvent> {
    let payload_json: String = row.get(3)?;
    let payload = serde_json::from_str(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, Type::Text, Box::new(error))
    })?;

    Ok(BuddyRunEvent {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: row.get(2)?,
        payload,
        created_at: row.get(4)?,
    })
}

pub(super) fn map_chat_run_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyChatRunEvent> {
    let payload_json: String = row.get(3)?;
    let event_type: String = row.get(2)?;
    let payload: Value = serde_json::from_str(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, Type::Text, Box::new(error))
    })?;

    Ok(BuddyChatRunEvent {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: event_type.clone(),
        payload: projection::project_chat_run_event_payload(&event_type, payload),
        created_at: row.get(4)?,
    })
}

pub(super) fn map_run_event_summary(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<BuddyRunEventSummary> {
    Ok(BuddyRunEventSummary {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: row.get(2)?,
        payload_preview: row.get(3)?,
        payload_chars: row.get(4)?,
        created_at: row.get(5)?,
    })
}
