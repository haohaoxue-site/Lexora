use rusqlite::{params, Connection};

use crate::error::BuddyResult;

use super::super::{
    rows::{map_chat_run_event, map_run_event, map_run_event_summary},
    BuddyChatRunEvent, BuddyRunEvent, BuddyRunEventSummary,
};

pub(super) fn list_run_events(
    connection: &Connection,
    run_id: String,
    after_id: Option<i64>,
    limit: i64,
) -> BuddyResult<Vec<BuddyRunEvent>> {
    let limit = limit.clamp(1, 200);

    if let Some(after_id) = after_id {
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, event_type, event_json, created_at
            FROM run_events
            WHERE run_id = ?1 AND id > ?2
            ORDER BY id ASC
            LIMIT ?3
            "#,
        )?;
        let events = statement
            .query_map(params![run_id, after_id, limit], map_run_event)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(events);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT id, run_id, event_type, event_json, created_at
        FROM run_events
        WHERE run_id = ?1
        ORDER BY id ASC
        LIMIT ?2
        "#,
    )?;
    let events = statement
        .query_map(params![run_id, limit], map_run_event)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

pub(super) fn list_chat_run_events(
    connection: &Connection,
    run_id: String,
    after_id: Option<i64>,
    limit: i64,
) -> BuddyResult<Vec<BuddyChatRunEvent>> {
    let limit = limit.clamp(1, 200);

    if let Some(after_id) = after_id {
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, event_type, event_json, created_at
            FROM run_events
            WHERE run_id = ?1 AND id > ?2
            ORDER BY id ASC
            LIMIT ?3
            "#,
        )?;
        let events = statement
            .query_map(params![run_id, after_id, limit], map_chat_run_event)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(events);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT id, run_id, event_type, event_json, created_at
        FROM run_events
        WHERE run_id = ?1
        ORDER BY id ASC
        LIMIT ?2
        "#,
    )?;
    let events = statement
        .query_map(params![run_id, limit], map_chat_run_event)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

pub(super) fn list_run_event_summaries(
    connection: &Connection,
    run_id: String,
    after_id: Option<i64>,
    limit: i64,
    payload_preview_chars: i64,
) -> BuddyResult<Vec<BuddyRunEventSummary>> {
    let limit = limit.clamp(1, 200);
    let payload_preview_chars = payload_preview_chars.clamp(80, 2000);

    if let Some(after_id) = after_id {
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, event_type, substr(event_json, 1, ?3), length(event_json), created_at
            FROM run_events
            WHERE run_id = ?1 AND id > ?2
            ORDER BY id ASC
            LIMIT ?4
            "#,
        )?;
        let events = statement
            .query_map(
                params![run_id, after_id, payload_preview_chars, limit],
                map_run_event_summary,
            )?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(events);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT id, run_id, event_type, substr(event_json, 1, ?2), length(event_json), created_at
        FROM run_events
        WHERE run_id = ?1
        ORDER BY id ASC
        LIMIT ?3
        "#,
    )?;
    let events = statement
        .query_map(
            params![run_id, payload_preview_chars, limit],
            map_run_event_summary,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}
