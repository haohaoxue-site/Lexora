#![cfg_attr(not(test), allow(dead_code))]

use rusqlite::{params, Connection, Row};
use uuid::Uuid;

use crate::error::{BuddyError, BuddyResult};

const MEMORY_SOURCE_REF_COLUMNS: &str = r#"
  id,
  candidate_id,
  source_kind,
  scope,
  project_id,
  relative_path,
  line_start,
  line_end,
  source_log_path,
  source_event_id,
  source_run_id,
  content_hash,
  created_at
"#;

const MEMORY_SOURCE_REF_COLUMNS_WITH_ALIAS: &str = r#"
  r.id,
  r.candidate_id,
  r.source_kind,
  r.scope,
  r.project_id,
  r.relative_path,
  r.line_start,
  r.line_end,
  r.source_log_path,
  r.source_event_id,
  r.source_run_id,
  r.content_hash,
  r.created_at
"#;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyMemorySourceRefRequest {
    pub candidate_id: String,
    pub source_kind: String,
    pub scope: String,
    pub project_id: Option<String>,
    pub relative_path: String,
    pub line_start: i64,
    pub line_end: i64,
    pub source_log_path: Option<String>,
    pub source_event_id: Option<String>,
    pub source_run_id: Option<String>,
    pub content_hash: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyMemorySourceRef {
    pub id: String,
    pub candidate_id: String,
    pub source_kind: String,
    pub scope: String,
    pub project_id: Option<String>,
    pub relative_path: String,
    pub line_start: i64,
    pub line_end: i64,
    pub source_log_path: Option<String>,
    pub source_event_id: Option<String>,
    pub source_run_id: Option<String>,
    pub content_hash: String,
    pub created_at: String,
}

pub fn create_memory_source_ref(
    connection: &Connection,
    request: CreateBuddyMemorySourceRefRequest,
) -> BuddyResult<BuddyMemorySourceRef> {
    validate_create_memory_source_ref_request(&request)?;
    if let Some(source_ref) =
        find_memory_source_ref_by_candidate(connection, &request.candidate_id)?
    {
        return Ok(source_ref);
    }

    let id = Uuid::new_v4().to_string();
    let project_id = normalize_optional_text(request.project_id);
    let source_log_path = normalize_optional_text(request.source_log_path);
    let source_event_id = normalize_optional_text(request.source_event_id);
    let source_run_id = normalize_optional_text(request.source_run_id);

    connection.execute(
        r#"
        INSERT INTO memory_source_refs(
          id,
          candidate_id,
          source_kind,
          scope,
          project_id,
          relative_path,
          line_start,
          line_end,
          source_log_path,
          source_event_id,
          source_run_id,
          content_hash
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            id,
            request.candidate_id.trim(),
            request.source_kind.trim(),
            request.scope.trim(),
            project_id.as_deref(),
            request.relative_path.trim(),
            request.line_start,
            request.line_end,
            source_log_path.as_deref(),
            source_event_id.as_deref(),
            source_run_id.as_deref(),
            request.content_hash.trim(),
        ],
    )?;

    find_memory_source_ref(connection, &id)
}

pub fn list_memory_source_refs(
    connection: &Connection,
    candidate_id: &str,
) -> BuddyResult<Vec<BuddyMemorySourceRef>> {
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_SOURCE_REF_COLUMNS}
        FROM memory_source_refs
        WHERE candidate_id = ?1
        ORDER BY created_at ASC, rowid ASC
        "#
    ))?;
    let refs = statement
        .query_map(params![candidate_id], map_memory_source_ref)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(refs)
}

pub fn list_recent_memory_source_refs(
    connection: &Connection,
    source_project: Option<&str>,
    limit: i64,
) -> BuddyResult<Vec<BuddyMemorySourceRef>> {
    let limit = limit.clamp(1, 100);
    let source_project = source_project
        .map(str::trim)
        .filter(|project| !project.is_empty());
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_SOURCE_REF_COLUMNS_WITH_ALIAS}
        FROM memory_source_refs r
        JOIN memory_candidates c ON c.id = r.candidate_id
        WHERE c.decision = 'accepted'
          AND (
            r.scope = 'global'
            OR (r.scope = 'project-private' AND r.project_id = ?1)
          )
        ORDER BY r.created_at DESC, r.rowid DESC
        LIMIT ?2
        "#
    ))?;
    let refs = statement
        .query_map(params![source_project, limit], map_memory_source_ref)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(refs)
}

pub fn find_memory_source_ref_by_candidate(
    connection: &Connection,
    candidate_id: &str,
) -> BuddyResult<Option<BuddyMemorySourceRef>> {
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_SOURCE_REF_COLUMNS}
        FROM memory_source_refs
        WHERE candidate_id = ?1
        LIMIT 1
        "#
    ))?;
    let mut rows = statement.query(params![candidate_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(map_memory_source_ref(row)?))
}

fn find_memory_source_ref(connection: &Connection, id: &str) -> BuddyResult<BuddyMemorySourceRef> {
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_SOURCE_REF_COLUMNS}
        FROM memory_source_refs
        WHERE id = ?1
        "#
    ))?;
    let mut rows = statement.query(params![id])?;
    let Some(row) = rows.next()? else {
        return Err(BuddyError::Validation(format!(
            "memory source ref {id} was not found after insert"
        )));
    };

    Ok(map_memory_source_ref(row)?)
}

fn map_memory_source_ref(row: &Row<'_>) -> Result<BuddyMemorySourceRef, rusqlite::Error> {
    Ok(BuddyMemorySourceRef {
        id: row.get(0)?,
        candidate_id: row.get(1)?,
        source_kind: row.get(2)?,
        scope: row.get(3)?,
        project_id: row.get(4)?,
        relative_path: row.get(5)?,
        line_start: row.get(6)?,
        line_end: row.get(7)?,
        source_log_path: row.get(8)?,
        source_event_id: row.get(9)?,
        source_run_id: row.get(10)?,
        content_hash: row.get(11)?,
        created_at: row.get(12)?,
    })
}

fn validate_create_memory_source_ref_request(
    request: &CreateBuddyMemorySourceRefRequest,
) -> BuddyResult<()> {
    if request.candidate_id.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory source ref candidate id is required".to_owned(),
        ));
    }
    if request.source_kind.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory source ref kind is required".to_owned(),
        ));
    }
    if !matches!(request.scope.trim(), "global" | "project-private") {
        return Err(BuddyError::Validation(format!(
            "unsupported memory source ref scope: {}",
            request.scope
        )));
    }
    if request.relative_path.trim().is_empty()
        || request.relative_path.starts_with('/')
        || request
            .relative_path
            .split('/')
            .any(|segment| segment == "..")
    {
        return Err(BuddyError::Validation(
            "memory source ref relative path must stay inside memory workspace".to_owned(),
        ));
    }
    if request.line_start <= 0 || request.line_end < request.line_start {
        return Err(BuddyError::Validation(
            "memory source ref line range is invalid".to_owned(),
        ));
    }
    if request.content_hash.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory source ref content hash is required".to_owned(),
        ));
    }

    Ok(())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
