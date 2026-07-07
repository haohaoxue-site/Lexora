use rusqlite::{params, types::Type, Connection};
use uuid::Uuid;

use crate::{
    domain::BuddyMessageVersionStatus,
    error::{BuddyError, BuddyResult},
    storage::{conversations, sessions},
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyMessageRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<BuddyMessageAttachment>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(test), allow(dead_code))]
pub struct AppendBuddyConversationMessageRequest {
    pub conversation_id: String,
    pub branch_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<BuddyMessageAttachment>,
    pub run_id: Option<String>,
    pub parent_message_id: Option<String>,
    pub version_group_id: Option<String>,
    pub version_index: i64,
    pub version_status: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyMessage {
    pub id: String,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub branch_id: Option<String>,
    pub run_id: Option<String>,
    pub parent_message_id: Option<String>,
    pub version_group_id: Option<String>,
    pub version_index: Option<i64>,
    pub version_status: Option<String>,
    pub role: String,
    pub content: String,
    pub attachments: Vec<BuddyMessageAttachment>,
    pub created_at: String,
}

#[derive(Clone, Debug, Default, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyMessageAttachment {
    pub attachment_id: Option<String>,
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub data_url: Option<String>,
    pub preview_path: Option<String>,
}

pub(crate) struct PreparedBuddyConversationMessageInsert {
    pub attachments: Vec<BuddyMessageAttachment>,
    pub branch_id: String,
    pub content: String,
    pub conversation_id: String,
    pub id: String,
    pub parent_message_id: Option<String>,
    pub role: String,
    pub run_id: Option<String>,
    pub version_group_id: String,
    pub version_index: i64,
    pub version_status: &'static str,
}

pub fn create_message(
    connection: &Connection,
    request: CreateBuddyMessageRequest,
) -> BuddyResult<BuddyMessage> {
    let id = Uuid::new_v4().to_string();
    let attachments_json = serde_json::to_string(&request.attachments)?;

    connection.execute(
        r#"
        INSERT INTO messages(id, session_id, role, content, attachments_json)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![
            id,
            request.session_id,
            request.role,
            request.content,
            attachments_json
        ],
    )?;
    sessions::touch_session(connection, &request.session_id)?;

    find_message(connection, &id)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn prepare_conversation_message_insert(
    connection: &Connection,
    request: AppendBuddyConversationMessageRequest,
) -> BuddyResult<PreparedBuddyConversationMessageInsert> {
    assert_branch_belongs_to_conversation(
        connection,
        &request.conversation_id,
        &request.branch_id,
    )?;
    let version_status = normalize_version_status(&request.version_status)?;
    let id = Uuid::new_v4().to_string();
    let version_group_id = request.version_group_id.unwrap_or_else(|| id.clone());

    Ok(PreparedBuddyConversationMessageInsert {
        attachments: request.attachments,
        branch_id: request.branch_id,
        content: request.content,
        conversation_id: request.conversation_id,
        id,
        parent_message_id: request.parent_message_id,
        role: request.role,
        run_id: request.run_id,
        version_group_id,
        version_index: request.version_index,
        version_status,
    })
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn insert_prepared_conversation_message(
    connection: &Connection,
    prepared: PreparedBuddyConversationMessageInsert,
) -> BuddyResult<BuddyMessage> {
    let attachments_json = serde_json::to_string(&prepared.attachments)?;

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
          attachments_json
        )
        VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        "#,
        params![
            prepared.id,
            prepared.conversation_id,
            prepared.branch_id,
            prepared.run_id,
            prepared.parent_message_id,
            prepared.version_group_id,
            prepared.version_index,
            prepared.version_status,
            prepared.role,
            prepared.content,
            attachments_json
        ],
    )?;
    conversations::touch_conversation(connection, &prepared.conversation_id)?;

    find_message(connection, &prepared.id)
}

pub fn list_messages(
    connection: &Connection,
    session_id: String,
    limit: i64,
) -> BuddyResult<Vec<BuddyMessage>> {
    let limit = limit.clamp(1, 200);
    let mut statement = connection.prepare(
        r#"
        SELECT
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
        FROM messages
        WHERE session_id = ?1
        ORDER BY created_at ASC, rowid ASC
        LIMIT ?2
        "#,
    )?;
    let messages = statement
        .query_map(params![session_id, limit], map_message)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(messages)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn list_active_conversation_messages(
    connection: &Connection,
    conversation_id: String,
    limit: i64,
) -> BuddyResult<Vec<BuddyMessage>> {
    let limit = limit.clamp(1, 200);
    let mut statement = connection.prepare(
        r#"
        SELECT
          messages.id,
          messages.session_id,
          messages.conversation_id,
          messages.branch_id,
          messages.run_id,
          messages.parent_message_id,
          messages.version_group_id,
          messages.version_index,
          messages.version_status,
          messages.role,
          messages.content,
          messages.attachments_json,
          messages.created_at
        FROM messages
        INNER JOIN conversations
          ON conversations.id = messages.conversation_id
         AND conversations.active_branch_id = messages.branch_id
        WHERE messages.conversation_id = ?1
          AND messages.version_status = 'active'
        ORDER BY messages.created_at ASC, messages.rowid ASC
        LIMIT ?2
        "#,
    )?;
    let messages = statement
        .query_map(params![conversation_id, limit], map_message)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(messages)
}

pub(crate) fn find_message(connection: &Connection, id: &str) -> BuddyResult<BuddyMessage> {
    Ok(connection.query_row(
        r#"
        SELECT
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
        FROM messages
        WHERE id = ?1
        "#,
        params![id],
        map_message,
    )?)
}

pub(crate) fn bind_conversation_message_run(
    connection: &Connection,
    conversation_id: &str,
    message_id: &str,
    run_id: &str,
) -> BuddyResult<BuddyMessage> {
    let affected_rows = connection.execute(
        r#"
        UPDATE messages
        SET run_id = ?1
        WHERE id = ?2
          AND conversation_id = ?3
        "#,
        params![run_id, message_id, conversation_id],
    )?;
    if affected_rows == 0 {
        return Err(BuddyError::Validation(
            "message does not belong to the conversation".to_owned(),
        ));
    }

    find_message(connection, message_id)
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyMessage> {
    Ok(BuddyMessage {
        id: row.get(0)?,
        session_id: row.get(1)?,
        conversation_id: row.get(2)?,
        branch_id: row.get(3)?,
        run_id: row.get(4)?,
        parent_message_id: row.get(5)?,
        version_group_id: row.get(6)?,
        version_index: row.get(7)?,
        version_status: row.get(8)?,
        role: row.get(9)?,
        content: row.get(10)?,
        attachments: parse_attachments(row.get(11)?, 11)?,
        created_at: row.get(12)?,
    })
}

#[cfg_attr(not(test), allow(dead_code))]
fn assert_branch_belongs_to_conversation(
    connection: &Connection,
    conversation_id: &str,
    branch_id: &str,
) -> BuddyResult<()> {
    let exists: bool = connection.query_row(
        r#"
        SELECT EXISTS(
          SELECT 1
          FROM conversation_branches
          WHERE conversation_id = ?1
            AND id = ?2
        )
        "#,
        params![conversation_id, branch_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(BuddyError::Validation(
            "conversation branch does not exist".to_owned(),
        ));
    }

    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
fn normalize_version_status(status: &str) -> BuddyResult<&'static str> {
    match status.trim() {
        value if value == BuddyMessageVersionStatus::Active.as_str() => {
            Ok(BuddyMessageVersionStatus::Active.as_str())
        }
        value if value == BuddyMessageVersionStatus::Superseded.as_str() => {
            Ok(BuddyMessageVersionStatus::Superseded.as_str())
        }
        _ => Err(BuddyError::Validation(
            "unsupported message version status".to_owned(),
        )),
    }
}

fn parse_attachments(
    value: String,
    column_index: usize,
) -> rusqlite::Result<Vec<BuddyMessageAttachment>> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column_index, Type::Text, Box::new(error))
    })
}
