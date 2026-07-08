use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{BuddyError, BuddyResult};

use super::BuddyStorage;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBuddyProjectRequest {
    pub root: String,
    pub name: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyProject {
    pub root: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

impl BuddyStorage {
    pub fn upsert_project(&self, request: UpsertBuddyProjectRequest) -> BuddyResult<BuddyProject> {
        self.with_connection("upsert_project", |connection| {
            self::upsert_project(connection, request)
        })
    }

    pub fn list_projects(&self, limit: i64) -> BuddyResult<Vec<BuddyProject>> {
        self.with_connection("list_projects", |connection| {
            self::list_projects(connection, limit)
        })
    }

    pub fn find_project(&self, root: &str) -> BuddyResult<Option<BuddyProject>> {
        self.with_connection("find_project", |connection| {
            self::find_project(connection, root)
        })
    }
}

pub fn upsert_project(
    connection: &Connection,
    request: UpsertBuddyProjectRequest,
) -> BuddyResult<BuddyProject> {
    let root = normalize_project_root(&request.root)?;
    let name = normalize_project_name(request.name.as_deref(), &root);

    connection.execute(
        r#"
        INSERT INTO projects(root, name)
        VALUES (?1, ?2)
        ON CONFLICT(root) DO UPDATE SET
          name = excluded.name,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        "#,
        params![root, name],
    )?;

    find_project(connection, &root)?
        .ok_or_else(|| BuddyError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
}

pub fn list_projects(connection: &Connection, limit: i64) -> BuddyResult<Vec<BuddyProject>> {
    let limit = limit.clamp(1, 500);
    let mut statement = connection.prepare(
        r#"
        SELECT root, name, created_at, updated_at
        FROM projects
        ORDER BY name COLLATE NOCASE ASC, root ASC
        LIMIT ?1
        "#,
    )?;
    let projects = statement
        .query_map(params![limit], map_project)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(projects)
}

pub fn find_project(connection: &Connection, root: &str) -> BuddyResult<Option<BuddyProject>> {
    let Some(root) = normalize_project_root_for_lookup(root)? else {
        return Ok(None);
    };

    connection
        .query_row(
            r#"
            SELECT root, name, created_at, updated_at
            FROM projects
            WHERE root = ?1
            "#,
            params![root],
            map_project,
        )
        .optional()
        .map_err(Into::into)
}

fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyProject> {
    Ok(BuddyProject {
        root: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn normalize_project_root(root: &str) -> BuddyResult<String> {
    let normalized = root.trim();
    if normalized.is_empty() {
        return Err(BuddyError::Validation(
            "project root is required".to_owned(),
        ));
    }

    let canonical = canonicalize_project_root(Path::new(normalized))?;

    path_to_utf8_string(canonical)
}

fn normalize_project_root_for_lookup(root: &str) -> BuddyResult<Option<String>> {
    let normalized = root.trim();
    if normalized.is_empty() {
        return Ok(None);
    }

    let canonical = match canonicalize_project_root(Path::new(normalized)) {
        Ok(root) => root,
        Err(BuddyError::Validation(_)) => return Ok(None),
        Err(error) => return Err(error),
    };

    path_to_utf8_string(canonical).map(Some)
}

fn canonicalize_project_root(root: &Path) -> BuddyResult<PathBuf> {
    let canonical = root.canonicalize().map_err(|_| {
        BuddyError::Validation("project root must be an existing directory".to_owned())
    })?;
    if !canonical.is_dir() {
        return Err(BuddyError::Validation(
            "project root must be an existing directory".to_owned(),
        ));
    }

    Ok(canonical)
}

fn path_to_utf8_string(path: PathBuf) -> BuddyResult<String> {
    path.into_os_string()
        .into_string()
        .map_err(|_| BuddyError::Validation("project root path is not valid UTF-8".to_owned()))
}

fn normalize_project_name(name: Option<&str>, root: &str) -> String {
    let normalized = name.map(str::trim).unwrap_or_default();
    if !normalized.is_empty() {
        return normalized.to_owned();
    }

    Path::new(root)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(root)
        .to_owned()
}
