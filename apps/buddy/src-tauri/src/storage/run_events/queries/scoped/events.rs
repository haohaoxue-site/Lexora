use rusqlite::{params, Connection};

use crate::error::BuddyResult;

use super::super::super::{rows::map_run_event, BuddyRunEvent};

pub(in crate::storage::run_events::queries) fn list_session_run_events(
    connection: &Connection,
    session_id: String,
    after_id: Option<i64>,
    run_limit: i64,
    event_limit: i64,
) -> BuddyResult<Vec<BuddyRunEvent>> {
    let run_limit = run_limit.clamp(1, 100);
    let event_limit = event_limit.clamp(1, 5000);

    if after_id.is_none() {
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, event_type, event_json, created_at
            FROM (
              SELECT events.id, events.run_id, events.event_type, events.event_json, events.created_at
              FROM run_events events
              INNER JOIN (
                SELECT id
                FROM runs
                WHERE session_id = ?1
                ORDER BY started_at DESC, rowid DESC
                LIMIT ?2
              ) latest_runs ON latest_runs.id = events.run_id
              ORDER BY events.id DESC
              LIMIT ?3
            ) latest_events
            ORDER BY id ASC
            "#,
        )?;
        let events = statement
            .query_map(params![session_id, run_limit, event_limit], map_run_event)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(events);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT events.id, events.run_id, events.event_type, events.event_json, events.created_at
        FROM run_events events
        INNER JOIN (
          SELECT id
          FROM runs
          WHERE session_id = ?1
          ORDER BY started_at DESC, rowid DESC
          LIMIT ?3
        ) latest_runs ON latest_runs.id = events.run_id
        WHERE (?2 IS NULL OR events.id > ?2)
        ORDER BY events.id ASC
        LIMIT ?4
        "#,
    )?;
    let events = statement
        .query_map(
            params![session_id, after_id, run_limit, event_limit],
            map_run_event,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

pub(in crate::storage::run_events::queries) fn list_conversation_run_events(
    connection: &Connection,
    conversation_id: String,
    after_id: Option<i64>,
    run_limit: i64,
    event_limit: i64,
) -> BuddyResult<Vec<BuddyRunEvent>> {
    let run_limit = run_limit.clamp(1, 100);
    let event_limit = event_limit.clamp(1, 5000);

    if after_id.is_none() {
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, event_type, event_json, created_at
            FROM (
              SELECT events.id, events.run_id, events.event_type, events.event_json, events.created_at
              FROM run_events events
              INNER JOIN (
                SELECT id
                FROM runs
                WHERE conversation_id = ?1
                ORDER BY started_at DESC, rowid DESC
                LIMIT ?2
              ) latest_runs ON latest_runs.id = events.run_id
              ORDER BY events.id DESC
              LIMIT ?3
            ) latest_events
            ORDER BY id ASC
            "#,
        )?;
        let events = statement
            .query_map(
                params![conversation_id, run_limit, event_limit],
                map_run_event,
            )?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(events);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT events.id, events.run_id, events.event_type, events.event_json, events.created_at
        FROM run_events events
        INNER JOIN (
          SELECT id
          FROM runs
          WHERE conversation_id = ?1
          ORDER BY started_at DESC, rowid DESC
          LIMIT ?3
        ) latest_runs ON latest_runs.id = events.run_id
        WHERE (?2 IS NULL OR events.id > ?2)
        ORDER BY events.id ASC
        LIMIT ?4
        "#,
    )?;
    let events = statement
        .query_map(
            params![conversation_id, after_id, run_limit, event_limit],
            map_run_event,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}
