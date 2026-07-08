use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::{BuddyError, BuddyResult};

use super::BuddyStorage;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRuntimeBinding {
    pub id: String,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub branch_id: Option<String>,
    pub runtime: String,
    pub cwd: Option<String>,
    pub external_thread_id: Option<String>,
    pub external_session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl BuddyStorage {
    pub fn upsert_runtime_binding(
        &self,
        session_id: String,
        runtime: String,
        cwd: Option<String>,
        external_thread_id: Option<String>,
        external_session_id: Option<String>,
    ) -> BuddyResult<BuddyRuntimeBinding> {
        self.with_connection("upsert_runtime_binding", |connection| {
            self::upsert_runtime_binding(
                connection,
                session_id,
                runtime,
                cwd,
                external_thread_id,
                external_session_id,
            )
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn find_conversation_runtime_binding(
        &self,
        conversation_id: String,
        branch_id: String,
        runtime: String,
        cwd: Option<String>,
    ) -> BuddyResult<Option<BuddyRuntimeBinding>> {
        self.with_connection("find_conversation_runtime_binding", |connection| {
            self::find_conversation_runtime_binding(
                connection,
                conversation_id,
                branch_id,
                runtime,
                cwd,
            )
        })
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn upsert_conversation_runtime_binding(
        &self,
        conversation_id: String,
        branch_id: String,
        runtime: String,
        cwd: Option<String>,
        external_thread_id: Option<String>,
        external_session_id: Option<String>,
    ) -> BuddyResult<BuddyRuntimeBinding> {
        self.with_connection("upsert_conversation_runtime_binding", |connection| {
            self::upsert_conversation_runtime_binding(
                connection,
                conversation_id,
                branch_id,
                runtime,
                cwd,
                external_thread_id,
                external_session_id,
            )
        })
    }
}

pub fn find_runtime_binding(
    connection: &Connection,
    session_id: String,
    runtime: String,
    cwd: Option<String>,
) -> BuddyResult<Option<BuddyRuntimeBinding>> {
    Ok(connection
        .query_row(
            r#"
            SELECT
              id,
              session_id,
              conversation_id,
              branch_id,
              runtime,
              cwd,
              external_thread_id,
              external_session_id,
              created_at,
              updated_at
            FROM runtime_bindings
            WHERE session_id = ?1
              AND runtime = ?2
              AND cwd IS ?3
            LIMIT 1
            "#,
            params![session_id, runtime, cwd],
            map_runtime_binding,
        )
        .optional()?)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn find_conversation_runtime_binding(
    connection: &Connection,
    conversation_id: String,
    branch_id: String,
    runtime: String,
    cwd: Option<String>,
) -> BuddyResult<Option<BuddyRuntimeBinding>> {
    Ok(connection
        .query_row(
            r#"
            SELECT
              id,
              session_id,
              conversation_id,
              branch_id,
              runtime,
              cwd,
              external_thread_id,
              external_session_id,
              created_at,
              updated_at
            FROM runtime_bindings
            WHERE conversation_id = ?1
              AND branch_id = ?2
              AND runtime = ?3
              AND cwd IS ?4
            LIMIT 1
            "#,
            params![conversation_id, branch_id, runtime, cwd],
            map_runtime_binding,
        )
        .optional()?)
}

pub fn upsert_runtime_binding(
    connection: &Connection,
    session_id: String,
    runtime: String,
    cwd: Option<String>,
    external_thread_id: Option<String>,
    external_session_id: Option<String>,
) -> BuddyResult<BuddyRuntimeBinding> {
    if let Some(existing) =
        find_runtime_binding(connection, session_id.clone(), runtime.clone(), cwd.clone())?
    {
        connection.execute(
            r#"
            UPDATE runtime_bindings
            SET external_thread_id = ?1,
                external_session_id = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?3
            "#,
            params![external_thread_id, external_session_id, existing.id],
        )?;

        return find_runtime_binding(connection, session_id, runtime, cwd)?
            .ok_or_else(|| BuddyError::Sqlite(rusqlite::Error::QueryReturnedNoRows));
    }

    let id = Uuid::new_v4().to_string();
    connection.execute(
        r#"
        INSERT INTO runtime_bindings(
          id,
          session_id,
          runtime,
          cwd,
          external_thread_id,
          external_session_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            id,
            session_id,
            runtime,
            cwd,
            external_thread_id,
            external_session_id
        ],
    )?;

    Ok(connection.query_row(
        r#"
        SELECT
          id,
          session_id,
          conversation_id,
          branch_id,
          runtime,
          cwd,
          external_thread_id,
          external_session_id,
          created_at,
          updated_at
        FROM runtime_bindings
        WHERE id = ?1
        "#,
        params![id],
        map_runtime_binding,
    )?)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn upsert_conversation_runtime_binding(
    connection: &Connection,
    conversation_id: String,
    branch_id: String,
    runtime: String,
    cwd: Option<String>,
    external_thread_id: Option<String>,
    external_session_id: Option<String>,
) -> BuddyResult<BuddyRuntimeBinding> {
    if let Some(existing) = find_conversation_runtime_binding(
        connection,
        conversation_id.clone(),
        branch_id.clone(),
        runtime.clone(),
        cwd.clone(),
    )? {
        connection.execute(
            r#"
            UPDATE runtime_bindings
            SET external_thread_id = ?1,
                external_session_id = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?3
            "#,
            params![external_thread_id, external_session_id, existing.id],
        )?;

        return find_conversation_runtime_binding(
            connection,
            conversation_id,
            branch_id,
            runtime,
            cwd,
        )?
        .ok_or_else(|| BuddyError::Sqlite(rusqlite::Error::QueryReturnedNoRows));
    }

    let id = Uuid::new_v4().to_string();
    connection.execute(
        r#"
        INSERT INTO runtime_bindings(
          id,
          conversation_id,
          branch_id,
          runtime,
          cwd,
          external_thread_id,
          external_session_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            id,
            conversation_id,
            branch_id,
            runtime,
            cwd,
            external_thread_id,
            external_session_id
        ],
    )?;

    Ok(connection.query_row(
        r#"
        SELECT
          id,
          session_id,
          conversation_id,
          branch_id,
          runtime,
          cwd,
          external_thread_id,
          external_session_id,
          created_at,
          updated_at
        FROM runtime_bindings
        WHERE id = ?1
        "#,
        params![id],
        map_runtime_binding,
    )?)
}

fn map_runtime_binding(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyRuntimeBinding> {
    Ok(BuddyRuntimeBinding {
        id: row.get(0)?,
        session_id: row.get(1)?,
        conversation_id: row.get(2)?,
        branch_id: row.get(3)?,
        runtime: row.get(4)?,
        cwd: row.get(5)?,
        external_thread_id: row.get(6)?,
        external_session_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
