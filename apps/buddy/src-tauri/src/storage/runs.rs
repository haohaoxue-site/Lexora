use rusqlite::{params, Connection};

use super::{
    conversations,
    run_events::{self, BuddyRunEvent, CreateBuddyRunEventRequest},
    BuddyStorage,
};
use crate::{
    domain::{BuddyRunStatus, BuddyRunTerminalStatus},
    error::{BuddyError, BuddyResult},
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyRunRequest {
    pub session_id: String,
    pub runtime: String,
    pub cwd: Option<String>,
    pub external_thread_id: Option<String>,
    pub external_run_id: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyConversationRunRequest {
    pub conversation_id: String,
    pub branch_id: String,
    pub triggering_message_id: String,
    pub intent: String,
    pub runtime: String,
    pub cwd: Option<String>,
    pub external_thread_id: Option<String>,
    pub external_run_id: Option<String>,
}

pub(crate) struct PreparedBuddyRunInsert {
    pub runtime: String,
    pub branch_id: Option<String>,
    pub conversation_id: Option<String>,
    pub cwd: Option<String>,
    pub external_run_id: Option<String>,
    pub external_thread_id: Option<String>,
    pub id: String,
    pub intent: Option<String>,
    pub log_path: String,
    pub session_id: Option<String>,
    pub triggering_message_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRun {
    pub id: String,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub branch_id: Option<String>,
    pub triggering_message_id: Option<String>,
    pub intent: Option<String>,
    pub log_path: Option<String>,
    pub runtime: String,
    pub cwd: Option<String>,
    pub status: String,
    pub external_thread_id: Option<String>,
    pub external_run_id: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BuddyFinishedRun {
    pub run: BuddyRun,
    pub event: BuddyRunEvent,
}

impl BuddyStorage {
    pub fn find_run(&self, id: String) -> BuddyResult<BuddyRun> {
        self.with_connection("find_run", |connection| self::find_run(connection, &id))
    }

    pub fn list_runs(&self, session_id: Option<String>, limit: i64) -> BuddyResult<Vec<BuddyRun>> {
        self.with_connection("list_runs", |connection| {
            self::list_runs(connection, session_id, limit)
        })
    }

    pub fn update_run_status(&self, id: String, status: BuddyRunStatus) -> BuddyResult<BuddyRun> {
        self.with_connection("update_run_status", |connection| {
            self::update_run_status(connection, id, status)
        })
    }
}

pub(crate) fn create_run_with_log_path(
    connection: &Connection,
    prepared: PreparedBuddyRunInsert,
) -> BuddyResult<BuddyRun> {
    match (
        prepared.session_id.as_deref(),
        prepared.conversation_id.as_deref(),
        prepared.branch_id.as_deref(),
    ) {
        (Some(_), None, None) => {}
        (None, Some(_), Some(_)) => {}
        _ => {
            return Err(BuddyError::Validation(
                "run target must be either a session or a conversation".to_owned(),
            ));
        }
    }

    connection.execute(
        r#"
        INSERT INTO runs(
          id,
          session_id,
          conversation_id,
          branch_id,
          triggering_message_id,
          intent,
          log_path,
          runtime,
          cwd,
          status,
          external_thread_id,
          external_run_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', ?10, ?11)
        "#,
        params![
            prepared.id,
            prepared.session_id,
            prepared.conversation_id,
            prepared.branch_id,
            prepared.triggering_message_id,
            prepared.intent,
            prepared.log_path,
            prepared.runtime,
            prepared.cwd,
            prepared.external_thread_id,
            prepared.external_run_id
        ],
    )?;
    match (
        prepared.session_id.as_deref(),
        prepared.conversation_id.as_deref(),
    ) {
        (Some(session_id), None) => super::sessions::touch_session(connection, session_id)?,
        (None, Some(conversation_id)) => {
            conversations::touch_conversation(connection, conversation_id)?
        }
        _ => {
            return Err(BuddyError::Validation(
                "run target must be either a session or a conversation".to_owned(),
            ));
        }
    }

    find_run(connection, &prepared.id)
}

pub fn list_runs(
    connection: &Connection,
    session_id: Option<String>,
    limit: i64,
) -> BuddyResult<Vec<BuddyRun>> {
    let limit = limit.clamp(1, 100);

    if let Some(session_id) = session_id {
        let mut statement = connection.prepare(
            r#"
            SELECT
              id,
              session_id,
              conversation_id,
              branch_id,
              triggering_message_id,
              intent,
              log_path,
              runtime,
              cwd,
              status,
              external_thread_id,
              external_run_id,
              started_at,
              completed_at
            FROM runs
            WHERE session_id = ?1
            ORDER BY started_at DESC, rowid DESC
            LIMIT ?2
            "#,
        )?;
        let runs = statement
            .query_map(params![session_id, limit], map_run)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(runs);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT
          id,
          session_id,
          conversation_id,
          branch_id,
          triggering_message_id,
          intent,
          log_path,
          runtime,
          cwd,
          status,
          external_thread_id,
          external_run_id,
          started_at,
          completed_at
        FROM runs
        ORDER BY started_at DESC, rowid DESC
        LIMIT ?1
        "#,
    )?;
    let runs = statement
        .query_map(params![limit], map_run)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(runs)
}

pub fn update_run_status(
    connection: &Connection,
    id: String,
    status: BuddyRunStatus,
) -> BuddyResult<BuddyRun> {
    let current = find_run(connection, &id)?;
    let status_str = status.as_str();
    if is_terminal_status(&current.status) {
        if current.status == status_str {
            return Ok(current);
        }

        return Err(BuddyError::Validation(format!(
            "run {} is already terminal with status {}",
            current.id, current.status
        )));
    }
    if current.status == BuddyRunStatus::Running.as_str() && status == BuddyRunStatus::Queued {
        return Err(BuddyError::Validation(format!(
            "run {} cannot move from running back to queued",
            current.id
        )));
    }

    let is_terminal = is_terminal_status(status_str);
    let completed_at_expression = if is_terminal {
        "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
    } else {
        "NULL"
    };
    let sql = format!(
        r#"
        UPDATE runs
        SET status = ?1,
            completed_at = {completed_at_expression}
        WHERE id = ?2
        "#
    );

    connection.execute(&sql, params![status_str, id])?;
    touch_run_owner(connection, &id)?;

    find_run(connection, &id)
}

pub fn finish_run(
    connection: &Connection,
    id: String,
    terminal_status: BuddyRunTerminalStatus,
    payload: serde_json::Value,
) -> BuddyResult<BuddyFinishedRun> {
    let status = terminal_status.run_status();
    let status_str = status.as_str();
    let event_type = terminal_status.event_type().as_str();
    let current = find_run(connection, &id)?;
    let run = if is_terminal_status(&current.status) {
        if current.status != status_str {
            return Err(BuddyError::Validation(format!(
                "run {} is already terminal with status {}",
                current.id, current.status
            )));
        }

        current
    } else {
        update_run_status(connection, id.clone(), status)?
    };
    let event = match run_events::find_latest_run_event_by_type(connection, &id, event_type)? {
        Some(event) => event,
        None => run_events::append_run_event(
            connection,
            CreateBuddyRunEventRequest::new(id, terminal_status.event_type(), payload),
        )?,
    };

    Ok(BuddyFinishedRun { event, run })
}

pub fn update_run_external_refs(
    connection: &Connection,
    id: String,
    external_thread_id: Option<String>,
    external_run_id: Option<String>,
) -> BuddyResult<BuddyRun> {
    connection.execute(
        r#"
        UPDATE runs
        SET external_thread_id = ?1,
            external_run_id = ?2
        WHERE id = ?3
        "#,
        params![external_thread_id, external_run_id, id],
    )?;
    touch_run_owner(connection, &id)?;

    find_run(connection, &id)
}

pub(crate) fn touch_run_owner(connection: &Connection, run_id: &str) -> BuddyResult<()> {
    let run = find_run(connection, run_id)?;
    match (run.session_id.as_deref(), run.conversation_id.as_deref()) {
        (Some(session_id), None) => super::sessions::touch_session(connection, session_id),
        (None, Some(conversation_id)) => {
            conversations::touch_conversation(connection, conversation_id)
        }
        _ => Err(BuddyError::Validation(
            "run target must be either a session or a conversation".to_owned(),
        )),
    }
}

fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled")
}

pub(super) fn find_run(connection: &Connection, id: &str) -> BuddyResult<BuddyRun> {
    Ok(connection.query_row(
        r#"
        SELECT
          id,
          session_id,
          conversation_id,
          branch_id,
          triggering_message_id,
          intent,
          log_path,
          runtime,
          cwd,
          status,
          external_thread_id,
          external_run_id,
          started_at,
          completed_at
        FROM runs
        WHERE id = ?1
        "#,
        params![id],
        map_run,
    )?)
}

fn map_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyRun> {
    Ok(BuddyRun {
        id: row.get(0)?,
        session_id: row.get(1)?,
        conversation_id: row.get(2)?,
        branch_id: row.get(3)?,
        triggering_message_id: row.get(4)?,
        intent: row.get(5)?,
        log_path: row.get(6)?,
        runtime: row.get(7)?,
        cwd: row.get(8)?,
        status: row.get(9)?,
        external_thread_id: row.get(10)?,
        external_run_id: row.get(11)?,
        started_at: row.get(12)?,
        completed_at: row.get(13)?,
    })
}
