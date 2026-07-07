use std::collections::HashMap;

use rusqlite::{params, params_from_iter, types::Type, Connection, OptionalExtension};
use serde_json::{Map, Value};

use crate::{error::BuddyResult, storage::runs};

const CHAT_EVENT_TEXT_MAX_CHARS: usize = 12_000;
const CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS: usize = 4_000;
const CHAT_EVENT_FIELD_MAX_CHARS: usize = 1_200;
const CHAT_EVENT_SHORT_TEXT_MAX_CHARS: usize = 240;
const CHAT_EVENT_ARRAY_LIMIT: usize = 40;
const CHAT_EVENT_FILE_PATH_LIMIT: usize = 80;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyRunEventRequest {
    pub run_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEvent {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyChatRunEvent {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEventCount {
    pub run_id: String,
    pub event_count: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEventSummary {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload_preview: String,
    pub payload_chars: i64,
    pub created_at: String,
}

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

pub fn list_run_events(
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

pub fn count_run_events(
    connection: &Connection,
    run_ids: Vec<String>,
) -> BuddyResult<Vec<BuddyRunEventCount>> {
    if run_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat_n("?", run_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        r#"
        SELECT run_id, COUNT(*)
        FROM run_events
        WHERE run_id IN ({placeholders})
        GROUP BY run_id
        "#
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map(params_from_iter(run_ids.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let counts = rows.into_iter().collect::<HashMap<_, _>>();

    Ok(run_ids
        .into_iter()
        .map(|run_id| BuddyRunEventCount {
            event_count: counts.get(&run_id).copied().unwrap_or(0),
            run_id,
        })
        .collect())
}

pub fn list_chat_run_events(
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

pub fn list_run_event_summaries(
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

pub fn list_session_run_events(
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

pub fn list_conversation_run_events(
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

pub fn list_chat_session_run_events(
    connection: &Connection,
    session_id: String,
    after_id: Option<i64>,
    run_limit: i64,
    event_limit: i64,
) -> BuddyResult<Vec<BuddyChatRunEvent>> {
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
            .query_map(
                params![session_id, run_limit, event_limit],
                map_chat_run_event,
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
            map_chat_run_event,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

pub fn list_chat_conversation_run_events(
    connection: &Connection,
    conversation_id: String,
    after_id: Option<i64>,
    run_limit: i64,
    event_limit: i64,
) -> BuddyResult<Vec<BuddyChatRunEvent>> {
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
                map_chat_run_event,
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
            map_chat_run_event,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
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

fn map_run_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyRunEvent> {
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

fn map_chat_run_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyChatRunEvent> {
    let payload_json: String = row.get(3)?;
    let event_type: String = row.get(2)?;
    let payload: Value = serde_json::from_str(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, Type::Text, Box::new(error))
    })?;

    Ok(BuddyChatRunEvent {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: event_type.clone(),
        payload: project_chat_run_event_payload(&event_type, payload),
        created_at: row.get(4)?,
    })
}

fn map_run_event_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyRunEventSummary> {
    Ok(BuddyRunEventSummary {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: row.get(2)?,
        payload_preview: row.get(3)?,
        payload_chars: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn project_chat_run_event_payload(event_type: &str, payload: Value) -> Value {
    let Value::Object(payload) = payload else {
        return Value::Object(Map::new());
    };

    match event_type {
        "host.action" => project_host_action_payload(&payload),
        "animation.intent" => project_selected_payload(
            &payload,
            &[
                "durationMs",
                "expiresAtUnixMs",
                "intent",
                "priority",
                "reason",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "approval.requested" => project_selected_payload(
            &payload,
            &["command", "itemId", "method", "reason"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "assistant.references" => project_assistant_references_payload(&payload),
        "codex.notification" => project_codex_notification_payload(&payload),
        "memory.context_pack" => project_memory_context_pack_payload(&payload),
        "message.completed" => project_selected_payload(
            &payload,
            &["itemId", "messageId", "phase", "turnId"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "message.delta" => project_message_delta_payload(&payload),
        "plan.delta" => project_selected_payload(
            &payload,
            &["delta", "itemId", "turnId"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "plan.updated" => project_plan_updated_payload(&payload),
        "run.cancelled" | "run.completed" => {
            project_selected_payload(&payload, &["message", "status"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "run.failed" => {
            project_selected_payload(&payload, &["message"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "run.started" => project_selected_payload(
            &payload,
            &["runtime", "cwd", "model", "userMessageId"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "router.decision" => project_selected_payload(
            &payload,
            &[
                "conversationId",
                "cwd",
                "intent",
                "memoryEligibility",
                "memoryPolicy",
                "reason",
                "requiresRuntime",
                "userMessageId",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "run.external_refs.updated" => project_selected_payload(
            &payload,
            &[
                "runtime",
                "cwd",
                "externalRunId",
                "externalThreadId",
                "protocol",
            ],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        "tool.finished" | "tool.started" => project_tool_event_payload(&payload),
        "tool.output_delta" => project_selected_payload(
            &payload,
            &["delta", "itemId"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "tool.patch_updated" => project_patch_updated_payload(&payload),
        "tool.progress" => {
            project_selected_payload(&payload, &["itemId", "message"], CHAT_EVENT_FIELD_MAX_CHARS)
        }
        "tool.terminal_interaction" => project_selected_payload(
            &payload,
            &["itemId", "stdin"],
            CHAT_EVENT_OUTPUT_DELTA_MAX_CHARS,
        ),
        "turn.completed" => project_turn_completed_payload(&payload),
        "turn.diff.updated" => project_diff_updated_payload(&payload),
        "user_input.requested" => project_user_input_payload(&payload),
        _ => Value::Object(Map::new()),
    }
}

fn project_selected_payload(
    payload: &Map<String, Value>,
    keys: &[&str],
    string_max_chars: usize,
) -> Value {
    let mut projected = Map::new();
    for key in keys {
        insert_compact_value(&mut projected, payload, key, string_max_chars, 2);
    }

    Value::Object(projected)
}

fn project_message_delta_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "phase",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "delta",
        CHAT_EVENT_TEXT_MAX_CHARS,
        1,
    );

    Value::Object(projected)
}

fn project_host_action_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    for key in [
        "action",
        "after",
        "animation",
        "durationMs",
        "priority",
        "reason",
        "source",
        "version",
    ] {
        insert_compact_value(&mut projected, payload, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    insert_compact_value(
        &mut projected,
        payload,
        "target",
        CHAT_EVENT_FIELD_MAX_CHARS,
        2,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "steps",
        CHAT_EVENT_FIELD_MAX_CHARS,
        4,
    );

    Value::Object(projected)
}

fn project_turn_completed_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "turnId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(final_message) = payload.get("finalAgentMessage").and_then(Value::as_object) {
        let mut message = Map::new();
        insert_compact_value(
            &mut message,
            final_message,
            "id",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "itemId",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "phase",
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
        insert_compact_value(
            &mut message,
            final_message,
            "text",
            CHAT_EVENT_TEXT_MAX_CHARS,
            1,
        );
        projected.insert("finalAgentMessage".to_owned(), Value::Object(message));
    }

    Value::Object(projected)
}

fn project_plan_updated_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "explanation",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "turnId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(plan) = payload.get("plan").and_then(Value::as_array) {
        projected.insert(
            "plan".to_owned(),
            Value::Array(
                plan.iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_plan_step)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_plan_step(value: &Value) -> Value {
    let Some(step) = value.as_object() else {
        return compact_json_value(value, CHAT_EVENT_SHORT_TEXT_MAX_CHARS, 1);
    };

    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        step,
        "status",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(&mut projected, step, "step", CHAT_EVENT_FIELD_MAX_CHARS, 1);

    Value::Object(projected)
}

fn project_diff_updated_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "turnId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_file_paths(
        &mut projected,
        read_file_paths(payload).or_else(|| {
            payload
                .get("diff")
                .and_then(Value::as_str)
                .map(extract_unified_diff_file_paths)
        }),
    );

    Value::Object(projected)
}

fn project_patch_updated_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "turnId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_file_paths(
        &mut projected,
        read_file_paths(payload).or_else(|| {
            payload
                .get("changes")
                .map(extract_patch_change_file_paths)
                .filter(|paths| !paths.is_empty())
        }),
    );

    Value::Object(projected)
}

fn project_tool_event_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(item) = payload.get("item") {
        projected.insert("item".to_owned(), project_tool_item(item));
    }

    Value::Object(projected)
}

fn project_tool_item(value: &Value) -> Value {
    let Some(item) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["command", "name", "path", "query", "status", "tool", "type"] {
        insert_compact_value(&mut projected, item, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    for key in ["aggregatedOutput", "output"] {
        insert_compact_value(&mut projected, item, key, CHAT_EVENT_TEXT_MAX_CHARS, 1);
    }
    insert_file_paths(
        &mut projected,
        read_file_paths(item).or_else(|| {
            item.get("changes")
                .map(extract_patch_change_file_paths)
                .filter(|paths| !paths.is_empty())
        }),
    );

    if let Some(arguments) = item.get("arguments") {
        projected.insert("arguments".to_owned(), project_tool_arguments(arguments));
    }
    if let Some(actions) = item.get("commandActions").and_then(Value::as_array) {
        projected.insert(
            "commandActions".to_owned(),
            Value::Array(
                actions
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_command_action)
                    .collect(),
            ),
        );
    }
    if let Some(result) = item.get("result").and_then(project_tool_result) {
        projected.insert("result".to_owned(), result);
    }

    Value::Object(projected)
}

fn project_tool_arguments(value: &Value) -> Value {
    let Some(arguments) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["name", "path", "pattern", "q", "query", "uri"] {
        insert_compact_value(
            &mut projected,
            arguments,
            key,
            CHAT_EVENT_FIELD_MAX_CHARS,
            1,
        );
    }

    Value::Object(projected)
}

fn project_command_action(value: &Value) -> Value {
    let Some(action) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["command", "name", "path", "query", "type"] {
        insert_compact_value(&mut projected, action, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }
    insert_file_paths(&mut projected, read_file_paths(action));

    Value::Object(projected)
}

fn project_tool_result(value: &Value) -> Option<Value> {
    let result = value.as_object()?;
    let content = result.get("content")?.as_array()?;
    let projected_content = content
        .iter()
        .take(3)
        .filter_map(project_tool_result_content)
        .collect::<Vec<_>>();

    if projected_content.is_empty() {
        return None;
    }

    let mut projected = Map::new();
    projected.insert("content".to_owned(), Value::Array(projected_content));

    Some(Value::Object(projected))
}

fn project_tool_result_content(value: &Value) -> Option<Value> {
    let content = value.as_object()?;
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        content,
        "type",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        content,
        "text",
        CHAT_EVENT_SHORT_TEXT_MAX_CHARS,
        1,
    );

    (!projected.is_empty()).then_some(Value::Object(projected))
}

fn project_user_input_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    if let Some(questions) = payload.get("questions").and_then(Value::as_array) {
        projected.insert(
            "questions".to_owned(),
            Value::Array(
                questions
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_user_input_question)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_user_input_question(value: &Value) -> Value {
    let Some(question) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["header", "id", "question"] {
        insert_compact_value(&mut projected, question, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    Value::Object(projected)
}

fn project_codex_notification_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    insert_compact_value(
        &mut projected,
        payload,
        "itemId",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );
    insert_compact_value(
        &mut projected,
        payload,
        "method",
        CHAT_EVENT_FIELD_MAX_CHARS,
        1,
    );

    let method = payload.get("method").and_then(Value::as_str);
    if let Some(params) = payload.get("params") {
        projected.insert(
            "params".to_owned(),
            project_codex_notification_params(method, params),
        );
    }

    Value::Object(projected)
}

fn project_codex_notification_params(method: Option<&str>, value: &Value) -> Value {
    let Some(params) = value.as_object() else {
        return Value::Object(Map::new());
    };

    match method {
        Some("account/rateLimits/updated") => {
            let mut projected = Map::new();
            if let Some(rate_limits) = params.get("rateLimits").and_then(Value::as_object) {
                let mut projected_rate_limits = Map::new();
                insert_compact_value(
                    &mut projected_rate_limits,
                    rate_limits,
                    "rateLimitReachedType",
                    CHAT_EVENT_FIELD_MAX_CHARS,
                    1,
                );
                if let Some(credits) = rate_limits.get("credits").and_then(Value::as_object) {
                    let mut projected_credits = Map::new();
                    insert_compact_value(&mut projected_credits, credits, "hasCredits", 32, 1);
                    insert_compact_value(&mut projected_credits, credits, "unlimited", 32, 1);
                    projected_rate_limits
                        .insert("credits".to_owned(), Value::Object(projected_credits));
                }
                projected.insert(
                    "rateLimits".to_owned(),
                    Value::Object(projected_rate_limits),
                );
            }
            Value::Object(projected)
        }
        Some("mcpServer/startupStatus/updated") => project_selected_payload(
            params,
            &["error", "name", "status"],
            CHAT_EVENT_FIELD_MAX_CHARS,
        ),
        Some("thread/status/changed") => {
            let mut projected = Map::new();
            insert_compact_value(
                &mut projected,
                params,
                "threadId",
                CHAT_EVENT_FIELD_MAX_CHARS,
                1,
            );
            if let Some(status) = params.get("status").and_then(Value::as_object) {
                projected.insert(
                    "status".to_owned(),
                    project_selected_payload(
                        status,
                        &["message", "type"],
                        CHAT_EVENT_FIELD_MAX_CHARS,
                    ),
                );
            }
            Value::Object(projected)
        }
        _ => compact_json_value(value, CHAT_EVENT_FIELD_MAX_CHARS, 2),
    }
}

fn project_memory_context_pack_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    for key in [
        "available",
        "injected",
        "notModified",
        "packHashPrefix",
        "sourceCount",
    ] {
        insert_compact_value(&mut projected, payload, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    if let Some(entries) = payload.get("entries").and_then(Value::as_array) {
        projected.insert(
            "entries".to_owned(),
            Value::Array(
                entries
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(project_memory_context_entry)
                    .collect(),
            ),
        );
    }

    Value::Object(projected)
}

fn project_memory_context_entry(value: &Value) -> Value {
    let Some(entry) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in [
        "citationLabel",
        "content",
        "lineEnd",
        "lineStart",
        "note",
        "path",
        "scope",
        "sourceEventId",
        "sourceKind",
        "sourceRunId",
    ] {
        insert_compact_value(&mut projected, entry, key, CHAT_EVENT_FIELD_MAX_CHARS, 2);
    }

    Value::Object(projected)
}

fn project_assistant_references_payload(payload: &Map<String, Value>) -> Value {
    let mut projected = Map::new();
    if let Some(citation) = payload.get("citation").and_then(Value::as_object) {
        let mut projected_citation = Map::new();
        if let Some(entries) = citation.get("entries").and_then(Value::as_array) {
            projected_citation.insert(
                "entries".to_owned(),
                Value::Array(
                    entries
                        .iter()
                        .take(CHAT_EVENT_ARRAY_LIMIT)
                        .map(project_assistant_reference_entry)
                        .collect(),
                ),
            );
        }
        projected.insert("citation".to_owned(), Value::Object(projected_citation));
    }

    Value::Object(projected)
}

fn project_assistant_reference_entry(value: &Value) -> Value {
    let Some(entry) = value.as_object() else {
        return Value::Object(Map::new());
    };

    let mut projected = Map::new();
    for key in ["lineEnd", "lineStart", "note", "path"] {
        insert_compact_value(&mut projected, entry, key, CHAT_EVENT_FIELD_MAX_CHARS, 1);
    }

    Value::Object(projected)
}

fn insert_compact_value(
    projected: &mut Map<String, Value>,
    payload: &Map<String, Value>,
    key: &str,
    string_max_chars: usize,
    depth: usize,
) {
    if let Some(value) = payload.get(key) {
        projected.insert(
            key.to_owned(),
            compact_json_value(value, string_max_chars, depth),
        );
    }
}

fn insert_file_paths(projected: &mut Map<String, Value>, paths: Option<Vec<String>>) {
    let paths = paths.unwrap_or_default();
    if paths.is_empty() {
        return;
    }

    projected.insert(
        "filePaths".to_owned(),
        Value::Array(paths.into_iter().map(Value::String).collect()),
    );
}

fn compact_json_value(value: &Value, string_max_chars: usize, depth: usize) -> Value {
    match value {
        Value::Array(items) => {
            if depth == 0 {
                return Value::Array(Vec::new());
            }

            Value::Array(
                items
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(|item| compact_json_value(item, string_max_chars, depth.saturating_sub(1)))
                    .collect(),
            )
        }
        Value::Bool(_) | Value::Null | Value::Number(_) => value.clone(),
        Value::Object(object) => {
            if depth == 0 {
                return Value::Object(Map::new());
            }

            Value::Object(
                object
                    .iter()
                    .take(CHAT_EVENT_ARRAY_LIMIT)
                    .map(|(key, value)| {
                        (
                            key.clone(),
                            compact_json_value(value, string_max_chars, depth.saturating_sub(1)),
                        )
                    })
                    .collect(),
            )
        }
        Value::String(text) => Value::String(compact_text(text, string_max_chars)),
    }
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let total_chars = value.chars().count();
    if total_chars <= max_chars {
        return value.to_owned();
    }

    let cutoff = value
        .char_indices()
        .nth(max_chars)
        .map(|(index, _)| index)
        .unwrap_or(value.len());

    format!("{}... ({} chars)", &value[..cutoff], total_chars)
}

fn read_file_paths(payload: &Map<String, Value>) -> Option<Vec<String>> {
    let paths = payload
        .get("filePaths")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .fold(Vec::new(), push_unique_file_path)
        })
        .filter(|paths| !paths.is_empty())?;

    Some(paths)
}

fn extract_unified_diff_file_paths(diff: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in diff.lines() {
        if let Some(path) = line.strip_prefix("+++ b/") {
            paths = push_unique_file_path(paths, path);
            continue;
        }

        if !line.starts_with("diff --git a/") {
            continue;
        }

        if let Some((_, path)) = line.rsplit_once(" b/") {
            paths = push_unique_file_path(paths, path);
        }
    }

    paths
}

fn extract_patch_change_file_paths(value: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    let Some(changes) = value.as_array() else {
        return paths;
    };

    for change in changes {
        let Some(change) = change.as_object() else {
            continue;
        };
        for key in ["path", "file", "target"] {
            if let Some(path) = change.get(key).and_then(Value::as_str) {
                paths = push_unique_file_path(paths, path);
            }
        }
    }

    paths
}

fn push_unique_file_path(mut paths: Vec<String>, path: &str) -> Vec<String> {
    let path = path.trim();
    if path.is_empty() || paths.len() >= CHAT_EVENT_FILE_PATH_LIMIT {
        return paths;
    }

    if !paths.iter().any(|item| item == path) {
        paths.push(path.to_owned());
    }

    paths
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::project_chat_run_event_payload;

    #[test]
    fn projects_router_decision_for_chat_events() {
        let projected = project_chat_run_event_payload(
            "router.decision",
            json!({
                "conversationId": "conv-1",
                "cwd": "/workspace",
                "debugBlob": "internal-only",
                "intent": "direct_answer",
                "memoryEligibility": {
                    "decision": "enabled",
                    "reason": "project scope"
                },
                "memoryPolicy": "eligible",
                "reason": "local answer is enough",
                "requiresRuntime": false,
                "userMessageId": "msg-1"
            }),
        );

        assert_eq!(projected["conversationId"], json!("conv-1"));
        assert_eq!(projected["intent"], json!("direct_answer"));
        assert_eq!(projected["memoryEligibility"]["decision"], json!("enabled"));
        assert_eq!(projected["requiresRuntime"], json!(false));
        assert!(projected.get("debugBlob").is_none());
    }

    #[test]
    fn projects_external_refs_update_for_chat_events() {
        let projected = project_chat_run_event_payload(
            "run.external_refs.updated",
            json!({
                "runtime": "codex",
                "branchId": "branch-1",
                "conversationId": "conv-1",
                "cwd": "/workspace",
                "externalRunId": "turn-1",
                "externalThreadId": "thread-1",
                "protocol": "codex_app_server"
            }),
        );

        assert_eq!(projected["runtime"], json!("codex"));
        assert_eq!(projected["externalRunId"], json!("turn-1"));
        assert_eq!(projected["externalThreadId"], json!("thread-1"));
        assert_eq!(projected["protocol"], json!("codex_app_server"));
        assert!(projected.get("conversationId").is_none());
    }

    #[test]
    fn projects_host_action_for_chat_events_without_flattening_steps() {
        let projected = project_chat_run_event_payload(
            "host.action",
            json!({
                "version": 1,
                "action": "sequence",
                "source": "buddy_builtin_host_skill",
                "steps": [
                    { "type": "move", "target": { "kind": "center" } },
                    { "type": "animation", "animation": "celebrate", "durationMs": 3000 },
                    { "type": "move", "target": { "kind": "home" }, "after": "sleep" }
                ],
                "debugBlob": "internal-only"
            }),
        );

        assert_eq!(projected["action"], json!("sequence"));
        assert_eq!(projected["version"], json!(1));
        assert_eq!(projected["steps"][0]["target"]["kind"], json!("center"));
        assert_eq!(projected["steps"][1]["animation"], json!("celebrate"));
        assert_eq!(projected["steps"][2]["target"]["kind"], json!("home"));
        assert_eq!(projected["steps"][2]["after"], json!("sleep"));
        assert!(projected.get("debugBlob").is_none());
    }

    #[test]
    fn projects_tool_output_for_chat_events() {
        let output = format!("{}tail", "A".repeat(12_000));
        let projected = project_chat_run_event_payload(
            "tool.finished",
            json!({
                "item": {
                    "aggregatedOutput": output,
                    "command": "rg -n 你好 .",
                    "debugBlob": "internal-only",
                    "status": "completed",
                    "type": "commandExecution"
                },
                "itemId": "tool-1"
            }),
        );

        let projected_output = projected["item"]["aggregatedOutput"]
            .as_str()
            .expect("projected output should be string");
        assert_eq!(projected["itemId"], json!("tool-1"));
        assert_eq!(projected["item"]["command"], json!("rg -n 你好 ."));
        assert!(projected_output.contains("12004 chars"));
        assert!(projected["item"].get("debugBlob").is_none());
    }
}
