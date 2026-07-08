use rusqlite::{params, types::Type, OptionalExtension};

use crate::error::{BuddyError, BuddyResult};

use super::BuddyStorage;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRegisteredAttachment {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub path: String,
    pub source: String,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct CreateBuddyRegisteredAttachmentRequest {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub path: String,
    pub source: String,
}

impl BuddyStorage {
    pub fn create_attachment(
        &self,
        request: CreateBuddyRegisteredAttachmentRequest,
    ) -> BuddyResult<BuddyRegisteredAttachment> {
        self.with_connection("create_attachment", |connection| {
            self::create_attachment(connection, request)
        })
    }

    pub fn find_attachment(&self, id: &str) -> BuddyResult<Option<BuddyRegisteredAttachment>> {
        self.with_connection("find_attachment", |connection| {
            self::find_attachment(connection, id)
        })
    }
}

pub fn create_attachment(
    connection: &rusqlite::Connection,
    request: CreateBuddyRegisteredAttachmentRequest,
) -> BuddyResult<BuddyRegisteredAttachment> {
    let size_bytes = i64::try_from(request.size_bytes)
        .map_err(|_| BuddyError::Validation("attachment size is too large".to_owned()))?;

    connection.execute(
        r#"
        INSERT INTO attachments(id, kind, name, mime_type, size_bytes, path, source)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            request.id,
            request.kind,
            request.name,
            request.mime_type,
            size_bytes,
            request.path,
            request.source
        ],
    )?;

    find_attachment(connection, &request.id)?
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
}

pub fn find_attachment(
    connection: &rusqlite::Connection,
    id: &str,
) -> BuddyResult<Option<BuddyRegisteredAttachment>> {
    Ok(connection
        .query_row(
            r#"
            SELECT id, kind, name, mime_type, size_bytes, path, source, created_at
            FROM attachments
            WHERE id = ?1
            "#,
            params![id],
            |row| {
                let size_bytes: i64 = row.get(4)?;
                Ok(BuddyRegisteredAttachment {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    name: row.get(2)?,
                    mime_type: row.get(3)?,
                    size_bytes: u64::try_from(size_bytes).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(4, Type::Integer, Box::new(error))
                    })?,
                    path: row.get(5)?,
                    source: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .optional()?)
}
