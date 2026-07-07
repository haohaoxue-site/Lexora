use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::{
    error::{BuddyError, BuddyResult},
    storage::projects,
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddySessionRequest {
    pub scope: String,
    pub runtime: String,
    pub project_root: Option<String>,
    pub title: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddySession {
    pub id: String,
    pub scope: String,
    pub runtime: String,
    pub project_root: Option<String>,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_session(
    connection: &Connection,
    request: CreateBuddySessionRequest,
) -> BuddyResult<BuddySession> {
    let id = Uuid::new_v4().to_string();
    let (scope, project_root) =
        resolve_session_scope(connection, request.scope.trim(), request.project_root)?;

    connection.execute(
        r#"
        INSERT INTO sessions(id, scope, runtime, project_root, title)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![id, scope, request.runtime, project_root, request.title],
    )?;

    find_session(connection, &id)
}

pub fn list_sessions(connection: &Connection, limit: i64) -> BuddyResult<Vec<BuddySession>> {
    let limit = limit.clamp(1, 100);
    let mut statement = connection.prepare(
        r#"
        SELECT id, scope, runtime, project_root, title, created_at, updated_at
        FROM sessions
        ORDER BY updated_at DESC, created_at DESC, rowid DESC
        LIMIT ?1
        "#,
    )?;
    let sessions = statement
        .query_map(params![limit], map_session)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sessions)
}

pub fn find_session(connection: &Connection, id: &str) -> BuddyResult<BuddySession> {
    Ok(connection.query_row(
        r#"
        SELECT id, scope, runtime, project_root, title, created_at, updated_at
        FROM sessions
        WHERE id = ?1
        "#,
        params![id],
        map_session,
    )?)
}

pub fn delete_session(connection: &Connection, id: &str) -> BuddyResult<bool> {
    let affected_rows = connection.execute(
        r#"
        DELETE FROM sessions
        WHERE id = ?1
        "#,
        params![id],
    )?;

    Ok(affected_rows > 0)
}

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddySession> {
    let project_root: Option<String> = row.get(3)?;

    Ok(BuddySession {
        id: row.get(0)?,
        scope: row.get(1)?,
        runtime: row.get(2)?,
        project_root,
        title: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn touch_session(connection: &Connection, session_id: &str) -> BuddyResult<()> {
    connection.execute(
        r#"
        UPDATE sessions
        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
        params![session_id],
    )?;

    Ok(())
}

fn resolve_session_scope(
    connection: &Connection,
    scope: &str,
    project_root: Option<String>,
) -> BuddyResult<(&'static str, Option<String>)> {
    let project_root = normalize_optional_project_root(project_root);
    match scope {
        "global" => {
            if project_root.is_some() {
                return Err(BuddyError::Validation(
                    "global sessions cannot bind a project root".to_owned(),
                ));
            }
            Ok(("global", None))
        }
        "project" => {
            let Some(project_root) = project_root.as_deref() else {
                return Err(BuddyError::Validation(
                    "project sessions require a project root".to_owned(),
                ));
            };
            let project = projects::find_project(connection, project_root)?.ok_or_else(|| {
                BuddyError::Validation("project is not authorized yet".to_owned())
            })?;

            Ok(("project", Some(project.root)))
        }
        _ => Err(BuddyError::Validation(
            "unsupported session scope".to_owned(),
        )),
    }
}

fn normalize_optional_project_root(project_root: Option<String>) -> Option<String> {
    project_root
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
