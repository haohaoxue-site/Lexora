#![cfg_attr(not(test), allow(dead_code))]

use std::path::Path;

use rusqlite::{params, Connection};

use crate::{
    domain::BuddyConversationScope,
    error::{BuddyError, BuddyResult},
    storage::projects,
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyConversationRequest {
    pub scope: String,
    pub project_root: Option<String>,
    pub title: Option<String>,
    pub source_conversation_id: Option<String>,
    pub forked_from_message_id: Option<String>,
    pub source_run_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyConversation {
    pub id: String,
    pub active_branch_id: String,
    pub scope: String,
    pub project_root: Option<String>,
    pub title: Option<String>,
    pub log_path: String,
    pub source_conversation_id: Option<String>,
    pub forked_from_message_id: Option<String>,
    pub source_run_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct PreparedBuddyConversationInsert {
    pub active_branch_id: String,
    pub forked_from_message_id: Option<String>,
    pub id: String,
    pub log_path: String,
    pub project_root: Option<String>,
    pub scope: &'static str,
    pub source_conversation_id: Option<String>,
    pub source_run_id: Option<String>,
    pub title: Option<String>,
}

pub(crate) fn prepare_conversation_insert(
    connection: &Connection,
    request: CreateBuddyConversationRequest,
    conversation_id: String,
    branch_id: String,
    log_path: String,
) -> BuddyResult<PreparedBuddyConversationInsert> {
    let (scope, project_root) =
        resolve_conversation_scope(connection, request.scope.trim(), request.project_root)?;

    Ok(PreparedBuddyConversationInsert {
        active_branch_id: branch_id,
        forked_from_message_id: request.forked_from_message_id,
        id: conversation_id,
        log_path,
        project_root,
        scope,
        source_conversation_id: request.source_conversation_id,
        source_run_id: request.source_run_id,
        title: request.title,
    })
}

pub(crate) fn insert_prepared_conversation(
    connection: &Connection,
    prepared: PreparedBuddyConversationInsert,
) -> BuddyResult<BuddyConversation> {
    let log_path = normalize_log_path(&prepared.log_path)?;

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
          source_run_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            prepared.id,
            prepared.active_branch_id,
            prepared.scope,
            prepared.project_root,
            prepared.title,
            log_path,
            prepared.source_conversation_id,
            prepared.forked_from_message_id,
            prepared.source_run_id
        ],
    )?;
    connection.execute(
        r#"
        INSERT INTO conversation_branches(
          id,
          conversation_id,
          parent_branch_id,
          forked_from_message_id,
          source_run_id
        )
        VALUES (?1, ?2, NULL, ?3, ?4)
        "#,
        params![
            prepared.active_branch_id,
            prepared.id,
            prepared.forked_from_message_id,
            prepared.source_run_id
        ],
    )?;

    find_conversation(connection, &prepared.id)
}

pub fn find_conversation(connection: &Connection, id: &str) -> BuddyResult<BuddyConversation> {
    Ok(connection.query_row(
        r#"
        SELECT
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
        FROM conversations
        WHERE id = ?1
        "#,
        params![id],
        map_conversation,
    )?)
}

pub fn list_conversations(
    connection: &Connection,
    limit: i64,
) -> BuddyResult<Vec<BuddyConversation>> {
    let limit = limit.clamp(1, 100);
    let mut statement = connection.prepare(
        r#"
        SELECT
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
        FROM conversations
        ORDER BY updated_at DESC, created_at DESC, rowid DESC
        LIMIT ?1
        "#,
    )?;
    let conversations = statement
        .query_map(params![limit], map_conversation)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(conversations)
}

pub fn delete_conversation(connection: &Connection, id: &str) -> BuddyResult<bool> {
    let affected_rows = connection.execute(
        r#"
        DELETE FROM conversations
        WHERE id = ?1
        "#,
        params![id],
    )?;

    Ok(affected_rows > 0)
}

pub fn touch_conversation(connection: &Connection, conversation_id: &str) -> BuddyResult<()> {
    connection.execute(
        r#"
        UPDATE conversations
        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
        params![conversation_id],
    )?;

    Ok(())
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyConversation> {
    Ok(BuddyConversation {
        id: row.get(0)?,
        active_branch_id: row.get(1)?,
        scope: row.get(2)?,
        project_root: row.get(3)?,
        title: row.get(4)?,
        log_path: row.get(5)?,
        source_conversation_id: row.get(6)?,
        forked_from_message_id: row.get(7)?,
        source_run_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn resolve_conversation_scope(
    connection: &Connection,
    scope: &str,
    project_root: Option<String>,
) -> BuddyResult<(&'static str, Option<String>)> {
    let project_root = normalize_optional_project_root(project_root);
    match scope {
        value if value == BuddyConversationScope::Global.as_str() => {
            if project_root.is_some() {
                return Err(BuddyError::Validation(
                    "global conversations cannot bind a project root".to_owned(),
                ));
            }
            Ok((BuddyConversationScope::Global.as_str(), None))
        }
        value if value == BuddyConversationScope::Project.as_str() => {
            let Some(project_root) = project_root.as_deref() else {
                return Err(BuddyError::Validation(
                    "project conversations require a project root".to_owned(),
                ));
            };
            let project = projects::find_project(connection, project_root)?.ok_or_else(|| {
                BuddyError::Validation("project is not authorized yet".to_owned())
            })?;

            Ok((BuddyConversationScope::Project.as_str(), Some(project.root)))
        }
        _ => Err(BuddyError::Validation(
            "unsupported conversation scope".to_owned(),
        )),
    }
}

fn normalize_optional_project_root(project_root: Option<String>) -> Option<String> {
    project_root
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn normalize_log_path(log_path: &str) -> BuddyResult<String> {
    let normalized = log_path.trim();
    if normalized.is_empty() {
        return Err(BuddyError::Validation(
            "conversation logPath is required".to_owned(),
        ));
    }
    if Path::new(normalized).is_absolute() {
        return Err(BuddyError::Validation(
            "conversation logPath must be relative to Buddy home".to_owned(),
        ));
    }

    Ok(normalized.to_owned())
}
