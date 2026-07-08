use rusqlite::{params, Connection, OptionalExtension};

use crate::error::BuddyResult;

use super::runs;

mod models;
mod projection;
mod queries;
mod rows;

pub use models::{
    BuddyChatRunEvent, BuddyRunEvent, BuddyRunEventCount, BuddyRunEventSummary,
    CreateBuddyRunEventRequest,
};
use rows::map_run_event;

pub fn append_run_event(
    connection: &Connection,
    request: CreateBuddyRunEventRequest,
) -> BuddyResult<BuddyRunEvent> {
    let payload = serde_json::to_string(&request.payload)?;

    connection.execute(
        r#"
        INSERT INTO run_events(run_id, event_type, event_json)
        VALUES (?1, ?2, ?3)
        "#,
        params![request.run_id, request.event_type, payload],
    )?;
    runs::touch_run_owner(connection, &request.run_id)?;

    find_run_event(connection, connection.last_insert_rowid())
}

pub(super) fn find_latest_run_event_by_type(
    connection: &Connection,
    run_id: &str,
    event_type: &str,
) -> BuddyResult<Option<BuddyRunEvent>> {
    Ok(connection
        .query_row(
            r#"
            SELECT id, run_id, event_type, event_json, created_at
            FROM run_events
            WHERE run_id = ?1 AND event_type = ?2
            ORDER BY id DESC
            LIMIT 1
            "#,
            params![run_id, event_type],
            map_run_event,
        )
        .optional()?)
}

fn find_run_event(connection: &Connection, id: i64) -> BuddyResult<BuddyRunEvent> {
    Ok(connection.query_row(
        r#"
        SELECT id, run_id, event_type, event_json, created_at
        FROM run_events
        WHERE id = ?1
        "#,
        params![id],
        map_run_event,
    )?)
}
