use std::{fs, path::Path};

use rusqlite::{params, Connection};
use serde::Deserialize;

use crate::{
    domain::BuddyRunEventType,
    error::{BuddyError, BuddyResult},
    storage::{
        conversations::BuddyConversation,
        memory_candidates::{self, CreateBuddyMemoryCandidateRequest},
        messages::BuddyMessageAttachment,
        runs::{self, BuddyRun},
        runtime_bindings,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalLogLine {
    schema_version: u16,
    timestamp: String,
    #[serde(rename = "type")]
    event_type: String,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationMetaPayload {
    active_branch_id: String,
    conversation_id: String,
    forked_from_message_id: Option<String>,
    log_path: String,
    project_root: Option<String>,
    scope: String,
    source_conversation_id: Option<String>,
    source_run_id: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageCreatedPayload {
    #[serde(default)]
    attachments: Vec<BuddyMessageAttachment>,
    branch_id: String,
    content: String,
    conversation_id: String,
    message_id: String,
    parent_message_id: Option<String>,
    role: String,
    run_id: Option<String>,
    version_group_id: String,
    version_index: i64,
    version_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunMetaPayload {
    runtime: String,
    branch_id: Option<String>,
    conversation_id: Option<String>,
    cwd: Option<String>,
    external_run_id: Option<String>,
    external_thread_id: Option<String>,
    intent: Option<String>,
    log_path: String,
    run_id: String,
    session_id: Option<String>,
    triggering_message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunEventPayload {
    event: serde_json::Value,
    event_type: String,
    run_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunExternalRefsUpdatedPayload {
    runtime: Option<String>,
    branch_id: Option<String>,
    conversation_id: Option<String>,
    cwd: Option<String>,
    external_run_id: Option<String>,
    external_thread_id: Option<String>,
}

pub(crate) fn reconcile_conversation_log(
    connection: &Connection,
    log_path: &str,
    absolute_log_path: &Path,
) -> BuddyResult<BuddyConversation> {
    let lines = read_local_log_lines(absolute_log_path)?;
    let meta_line = lines
        .iter()
        .find(|line| line.event_type == "conversation_meta")
        .ok_or_else(|| BuddyError::Validation("conversation log is missing metadata".to_owned()))?;
    let meta: ConversationMetaPayload = serde_json::from_value(meta_line.payload.clone())?;
    if meta.log_path != log_path {
        return Err(BuddyError::Validation(
            "conversation metadata logPath does not match requested log".to_owned(),
        ));
    }

    upsert_conversation(connection, &meta, &meta_line.timestamp)?;
    connection.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![meta.conversation_id],
    )?;

    let mut updated_at = meta_line.timestamp.clone();
    for line in lines
        .iter()
        .filter(|line| line.event_type == "message.created")
    {
        let message: MessageCreatedPayload = serde_json::from_value(line.payload.clone())?;
        if message.conversation_id != meta.conversation_id {
            return Err(BuddyError::Validation(
                "message event belongs to a different conversation".to_owned(),
            ));
        }
        insert_message(connection, &message, &line.timestamp)?;
        updated_at = line.timestamp.clone();
    }

    connection.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![updated_at, meta.conversation_id],
    )?;

    super::conversations::find_conversation(connection, &meta.conversation_id)
}

pub(crate) fn reconcile_run_log(
    connection: &Connection,
    log_path: &str,
    absolute_log_path: &Path,
) -> BuddyResult<BuddyRun> {
    let lines = read_local_log_lines(absolute_log_path)?;
    let meta_line = lines
        .iter()
        .find(|line| line.event_type == "run_meta")
        .ok_or_else(|| BuddyError::Validation("run log is missing metadata".to_owned()))?;
    let meta: RunMetaPayload = serde_json::from_value(meta_line.payload.clone())?;
    if meta.log_path != log_path {
        return Err(BuddyError::Validation(
            "run metadata logPath does not match requested log".to_owned(),
        ));
    }

    let terminal_line = lines
        .iter()
        .rev()
        .find(|line| terminal_status(&line.event_type).is_some());
    let status = terminal_line
        .and_then(|line| terminal_status(&line.event_type))
        .unwrap_or("queued");
    let completed_at = terminal_line.map(|line| line.timestamp.as_str());
    let external_refs_update = latest_run_external_refs_update(&lines, &meta.run_id)?;
    let external_thread_id = match external_refs_update.as_ref() {
        Some(update) => update.external_thread_id.clone(),
        None => meta.external_thread_id.clone(),
    };
    let external_run_id = match external_refs_update.as_ref() {
        Some(update) => update.external_run_id.clone(),
        None => meta.external_run_id.clone(),
    };

    upsert_run(
        connection,
        &meta,
        &meta_line.timestamp,
        status,
        completed_at,
        external_thread_id.as_deref(),
        external_run_id.as_deref(),
    )?;
    bind_triggering_message_run(connection, &meta)?;
    if let Some(update) = external_refs_update.as_ref() {
        restore_conversation_runtime_binding(connection, &meta, update)?;
    }
    connection.execute(
        "DELETE FROM run_events WHERE run_id = ?1",
        params![meta.run_id],
    )?;

    for line in lines.iter().filter(|line| line.event_type != "run_meta") {
        let event: RunEventPayload = serde_json::from_value(line.payload.clone())?;
        if event.run_id != meta.run_id {
            return Err(BuddyError::Validation(
                "run event belongs to a different run".to_owned(),
            ));
        }
        if event.event_type != line.event_type {
            return Err(BuddyError::Validation(
                "run event type does not match log line type".to_owned(),
            ));
        }
        insert_run_event(connection, &event, &line.timestamp)?;
        if event.event_type == BuddyRunEventType::MemoryCandidateCreated.as_str() {
            replay_memory_candidate_created_event(connection, &event, &meta.log_path)?;
        }
    }

    runs::find_run(connection, &meta.run_id)
}

fn read_local_log_lines(path: &Path) -> BuddyResult<Vec<LocalLogLine>> {
    let content = fs::read_to_string(path)?;
    let mut lines = Vec::new();
    for (index, line) in content.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let parsed: LocalLogLine = serde_json::from_str(line).map_err(|error| {
            BuddyError::Validation(format!(
                "local log line {} is not valid JSON: {}",
                index + 1,
                error
            ))
        })?;
        if parsed.schema_version != 1 {
            return Err(BuddyError::Validation(format!(
                "unsupported local log schema version {}",
                parsed.schema_version
            )));
        }
        lines.push(parsed);
    }

    Ok(lines)
}

fn upsert_conversation(
    connection: &Connection,
    meta: &ConversationMetaPayload,
    timestamp: &str,
) -> BuddyResult<()> {
    connection.execute(
        r#"
        INSERT INTO conversations(
          id,
          active_branch_id,
          scope,
          project_root,
          title,
          log_path,
          source_conversation_id,
          forked_from_message_id,
          source_run_id,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
        ON CONFLICT(id) DO UPDATE SET
          active_branch_id = excluded.active_branch_id,
          scope = excluded.scope,
          project_root = excluded.project_root,
          title = excluded.title,
          log_path = excluded.log_path,
          source_conversation_id = excluded.source_conversation_id,
          forked_from_message_id = excluded.forked_from_message_id,
          source_run_id = excluded.source_run_id,
          updated_at = excluded.updated_at
        "#,
        params![
            meta.conversation_id,
            meta.active_branch_id,
            meta.scope,
            meta.project_root,
            meta.title,
            meta.log_path,
            meta.source_conversation_id,
            meta.forked_from_message_id,
            meta.source_run_id,
            timestamp
        ],
    )?;
    connection.execute(
        r#"
        INSERT INTO conversation_branches(
          id,
          conversation_id,
          parent_branch_id,
          forked_from_message_id,
          source_run_id,
          created_at
        )
        VALUES (?1, ?2, NULL, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          forked_from_message_id = excluded.forked_from_message_id,
          source_run_id = excluded.source_run_id
        "#,
        params![
            meta.active_branch_id,
            meta.conversation_id,
            meta.forked_from_message_id,
            meta.source_run_id,
            timestamp
        ],
    )?;

    Ok(())
}

fn insert_message(
    connection: &Connection,
    message: &MessageCreatedPayload,
    timestamp: &str,
) -> BuddyResult<()> {
    let attachments_json = serde_json::to_string(&message.attachments)?;
    connection.execute(
        r#"
        INSERT INTO messages(
          id,
          session_id,
          conversation_id,
          branch_id,
          run_id,
          parent_message_id,
          version_group_id,
          version_index,
          version_status,
          role,
          content,
          attachments_json,
          created_at
        )
        VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            message.message_id,
            message.conversation_id,
            message.branch_id,
            message.run_id,
            message.parent_message_id,
            message.version_group_id,
            message.version_index,
            message.version_status,
            message.role,
            message.content,
            attachments_json,
            timestamp
        ],
    )?;

    Ok(())
}

fn upsert_run(
    connection: &Connection,
    meta: &RunMetaPayload,
    started_at: &str,
    status: &str,
    completed_at: Option<&str>,
    external_thread_id: Option<&str>,
    external_run_id: Option<&str>,
) -> BuddyResult<()> {
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
          external_run_id,
          started_at,
          completed_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
          session_id = excluded.session_id,
          conversation_id = excluded.conversation_id,
          branch_id = excluded.branch_id,
          triggering_message_id = excluded.triggering_message_id,
          intent = excluded.intent,
          log_path = excluded.log_path,
          runtime = excluded.runtime,
          cwd = excluded.cwd,
          status = excluded.status,
          external_thread_id = excluded.external_thread_id,
          external_run_id = excluded.external_run_id,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at
        "#,
        params![
            meta.run_id,
            meta.session_id,
            meta.conversation_id,
            meta.branch_id,
            meta.triggering_message_id,
            meta.intent,
            meta.log_path,
            meta.runtime,
            meta.cwd,
            status,
            external_thread_id,
            external_run_id,
            started_at,
            completed_at
        ],
    )?;

    Ok(())
}

fn bind_triggering_message_run(connection: &Connection, meta: &RunMetaPayload) -> BuddyResult<()> {
    let Some(conversation_id) = meta.conversation_id.as_ref() else {
        return Ok(());
    };
    let Some(triggering_message_id) = meta.triggering_message_id.as_ref() else {
        return Ok(());
    };

    super::messages::bind_conversation_message_run(
        connection,
        conversation_id,
        triggering_message_id,
        &meta.run_id,
    )?;

    Ok(())
}

fn latest_run_external_refs_update(
    lines: &[LocalLogLine],
    expected_run_id: &str,
) -> BuddyResult<Option<RunExternalRefsUpdatedPayload>> {
    let mut latest = None;
    for line in lines
        .iter()
        .filter(|line| line.event_type == BuddyRunEventType::RunExternalRefsUpdated.as_str())
    {
        let event: RunEventPayload = serde_json::from_value(line.payload.clone())?;
        if event.run_id != expected_run_id {
            return Err(BuddyError::Validation(
                "run external refs event belongs to a different run".to_owned(),
            ));
        }
        if event.event_type != line.event_type {
            return Err(BuddyError::Validation(
                "run external refs event type does not match log line type".to_owned(),
            ));
        }
        latest = Some(serde_json::from_value(event.event)?);
    }

    Ok(latest)
}

fn restore_conversation_runtime_binding(
    connection: &Connection,
    meta: &RunMetaPayload,
    update: &RunExternalRefsUpdatedPayload,
) -> BuddyResult<()> {
    let Some(external_thread_id) = update.external_thread_id.as_ref() else {
        return Ok(());
    };
    let conversation_id = update
        .conversation_id
        .as_ref()
        .or(meta.conversation_id.as_ref());
    let branch_id = update.branch_id.as_ref().or(meta.branch_id.as_ref());
    let Some(conversation_id) = conversation_id else {
        return Ok(());
    };
    let Some(branch_id) = branch_id else {
        return Ok(());
    };
    let runtime = update.runtime.as_deref().unwrap_or(meta.runtime.as_str());
    let cwd = update.cwd.clone().or_else(|| meta.cwd.clone());

    runtime_bindings::upsert_conversation_runtime_binding(
        connection,
        conversation_id.clone(),
        branch_id.clone(),
        runtime.to_owned(),
        cwd,
        Some(external_thread_id.clone()),
        None,
    )?;

    Ok(())
}

fn insert_run_event(
    connection: &Connection,
    event: &RunEventPayload,
    timestamp: &str,
) -> BuddyResult<()> {
    connection.execute(
        r#"
        INSERT INTO run_events(run_id, event_type, event_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        "#,
        params![
            event.run_id,
            event.event_type,
            serde_json::to_string(&event.event)?,
            timestamp
        ],
    )?;

    Ok(())
}

fn replay_memory_candidate_created_event(
    connection: &Connection,
    event: &RunEventPayload,
    expected_log_path: &str,
) -> BuddyResult<()> {
    let request: CreateBuddyMemoryCandidateRequest = serde_json::from_value(event.event.clone())?;
    if request.source_log_path != expected_log_path {
        return Err(BuddyError::Validation(
            "memory candidate sourceLogPath does not match run log".to_owned(),
        ));
    }
    if request.source_event_id.as_deref().is_none_or(str::is_empty) {
        return Err(BuddyError::Validation(
            "memory candidate replay requires sourceEventId".to_owned(),
        ));
    }
    if request
        .run_id
        .as_deref()
        .is_some_and(|run_id| run_id != event.run_id)
    {
        return Err(BuddyError::Validation(
            "memory candidate runId does not match run event".to_owned(),
        ));
    }

    memory_candidates::create_memory_candidate(connection, request)?;

    Ok(())
}

fn terminal_status(event_type: &str) -> Option<&'static str> {
    match event_type {
        "run.completed" => Some("completed"),
        "run.failed" => Some("failed"),
        "run.cancelled" => Some("cancelled"),
        _ => None,
    }
}
