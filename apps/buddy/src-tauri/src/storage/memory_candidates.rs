use rusqlite::{params, Connection, Row};
use uuid::Uuid;

use crate::error::{BuddyError, BuddyResult};

const MEMORY_CANDIDATE_COLUMNS: &str = r#"
  id,
  run_id,
  conversation_id,
  source_log_path,
  source_event_id,
  scope,
  project_id,
  candidate_type,
  content,
  reason,
  confidence,
  eligibility_json,
  source_refs_json,
  decision,
  created_at,
  updated_at
"#;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyMemoryCandidateRequest {
    pub run_id: Option<String>,
    pub conversation_id: Option<String>,
    pub source_log_path: String,
    pub source_event_id: Option<String>,
    pub scope: String,
    pub project_id: Option<String>,
    pub candidate_type: String,
    pub content: String,
    pub reason: String,
    pub confidence: f64,
    pub eligibility: serde_json::Value,
    pub source_refs: serde_json::Value,
    pub decision: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyMemoryCandidate {
    pub id: String,
    pub run_id: Option<String>,
    pub conversation_id: Option<String>,
    pub source_log_path: String,
    pub source_event_id: Option<String>,
    pub scope: String,
    pub project_id: Option<String>,
    pub candidate_type: String,
    pub content: String,
    pub reason: String,
    pub confidence: f64,
    pub eligibility: serde_json::Value,
    pub source_refs: serde_json::Value,
    pub decision: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_memory_candidate(
    connection: &Connection,
    request: CreateBuddyMemoryCandidateRequest,
) -> BuddyResult<BuddyMemoryCandidate> {
    let source_event_id = normalize_optional_text(request.source_event_id);
    let project_id = normalize_optional_text(request.project_id);
    let request = CreateBuddyMemoryCandidateRequest {
        project_id,
        source_event_id,
        ..request
    };
    validate_create_memory_candidate_request(&request)?;

    if let Some(source_event_id) = request.source_event_id.as_deref() {
        if let Some(candidate) = find_candidate_by_source_event_and_type(
            connection,
            source_event_id,
            &request.candidate_type,
        )? {
            return Ok(candidate);
        }
    }

    let id = Uuid::new_v4().to_string();
    let eligibility_json = serde_json::to_string(&request.eligibility)?;
    let source_refs_json = serde_json::to_string(&request.source_refs)?;
    let run_id = request.run_id.as_deref();
    let conversation_id = request.conversation_id.as_deref();
    let source_log_path = request.source_log_path.trim();
    let source_event_id = request.source_event_id.as_deref();
    let scope = request.scope.trim();
    let project_id = request.project_id.as_deref();
    let candidate_type = request.candidate_type.trim();
    let content = request.content.trim();
    let reason = request.reason.trim();
    let decision = request.decision.trim();

    connection.execute(
        r#"
        INSERT INTO memory_candidates(
          id,
          run_id,
          conversation_id,
          source_log_path,
          source_event_id,
          scope,
          project_id,
          candidate_type,
          content,
          reason,
          confidence,
          eligibility_json,
          source_refs_json,
          decision
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        "#,
        params![
            id,
            run_id,
            conversation_id,
            source_log_path,
            source_event_id,
            scope,
            project_id,
            candidate_type,
            content,
            reason,
            request.confidence,
            eligibility_json,
            source_refs_json,
            decision,
        ],
    )?;

    find_memory_candidate(connection, &id)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn list_memory_candidates(
    connection: &Connection,
    decision: Option<&str>,
    limit: i64,
) -> BuddyResult<Vec<BuddyMemoryCandidate>> {
    let limit = limit.clamp(1, 100);
    let decision = decision.map(str::trim).filter(|value| !value.is_empty());

    if let Some(decision) = decision {
        let mut statement = connection.prepare(&format!(
            r#"
            SELECT {MEMORY_CANDIDATE_COLUMNS}
            FROM memory_candidates
            WHERE decision = ?1
            ORDER BY created_at DESC, rowid DESC
            LIMIT ?2
            "#
        ))?;
        let mut rows = statement.query(params![decision, limit])?;
        return collect_memory_candidates(&mut rows);
    }

    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_CANDIDATE_COLUMNS}
        FROM memory_candidates
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?1
        "#
    ))?;
    let mut rows = statement.query(params![limit])?;
    collect_memory_candidates(&mut rows)
}

pub(crate) fn find_memory_candidate(
    connection: &Connection,
    id: &str,
) -> BuddyResult<BuddyMemoryCandidate> {
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_CANDIDATE_COLUMNS}
        FROM memory_candidates
        WHERE id = ?1
        "#
    ))?;
    let mut rows = statement.query(params![id])?;
    let Some(row) = rows.next()? else {
        return Err(BuddyError::Validation(format!(
            "memory candidate {id} was not found after insert"
        )));
    };

    map_memory_candidate(row)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn update_memory_candidate_decision(
    connection: &Connection,
    id: &str,
    decision: &str,
) -> BuddyResult<BuddyMemoryCandidate> {
    if !matches!(decision, "accepted" | "ignored" | "disabled") {
        return Err(BuddyError::Validation(format!(
            "unsupported memory candidate decision: {decision}"
        )));
    }

    connection.execute(
        r#"
        UPDATE memory_candidates
        SET decision = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
        params![id, decision],
    )?;

    find_memory_candidate(connection, id)
}

fn find_candidate_by_source_event_and_type(
    connection: &Connection,
    source_event_id: &str,
    candidate_type: &str,
) -> BuddyResult<Option<BuddyMemoryCandidate>> {
    let mut statement = connection.prepare(&format!(
        r#"
        SELECT {MEMORY_CANDIDATE_COLUMNS}
        FROM memory_candidates
        WHERE source_event_id = ?1 AND candidate_type = ?2
        LIMIT 1
        "#
    ))?;
    let mut rows = statement.query(params![source_event_id, candidate_type])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(map_memory_candidate(row)?))
}

#[cfg_attr(not(test), allow(dead_code))]
fn collect_memory_candidates(
    rows: &mut rusqlite::Rows<'_>,
) -> BuddyResult<Vec<BuddyMemoryCandidate>> {
    let mut candidates = Vec::new();
    while let Some(row) = rows.next()? {
        candidates.push(map_memory_candidate(row)?);
    }

    Ok(candidates)
}

fn map_memory_candidate(row: &Row<'_>) -> BuddyResult<BuddyMemoryCandidate> {
    let eligibility_json: String = row.get(11)?;
    let source_refs_json: String = row.get(12)?;

    Ok(BuddyMemoryCandidate {
        id: row.get(0)?,
        run_id: row.get(1)?,
        conversation_id: row.get(2)?,
        source_log_path: row.get(3)?,
        source_event_id: row.get(4)?,
        scope: row.get(5)?,
        project_id: row.get(6)?,
        candidate_type: row.get(7)?,
        content: row.get(8)?,
        reason: row.get(9)?,
        confidence: row.get(10)?,
        eligibility: serde_json::from_str(&eligibility_json)?,
        source_refs: serde_json::from_str(&source_refs_json)?,
        decision: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn validate_create_memory_candidate_request(
    request: &CreateBuddyMemoryCandidateRequest,
) -> BuddyResult<()> {
    if request.source_log_path.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory candidate source log path is required".to_owned(),
        ));
    }
    if request.candidate_type.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory candidate type is required".to_owned(),
        ));
    }
    if request.content.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory candidate content is required".to_owned(),
        ));
    }
    if request.reason.trim().is_empty() {
        return Err(BuddyError::Validation(
            "memory candidate reason is required".to_owned(),
        ));
    }
    if !request.confidence.is_finite() {
        return Err(BuddyError::Validation(
            "memory candidate confidence must be finite".to_owned(),
        ));
    }
    if !matches!(request.scope.trim(), "global" | "project-private") {
        return Err(BuddyError::Validation(format!(
            "unsupported memory candidate scope: {}",
            request.scope
        )));
    }
    if request.candidate_type.trim() == "project.fact" {
        if request.scope.trim() != "project-private" {
            return Err(BuddyError::Validation(
                "project fact memory candidate requires project-private scope".to_owned(),
            ));
        }
        if request.project_id.as_deref().is_none_or(str::is_empty) {
            return Err(BuddyError::Validation(
                "project fact memory candidate requires project id".to_owned(),
            ));
        }
    }
    if !matches!(request.decision.trim(), "accepted" | "ignored" | "disabled") {
        return Err(BuddyError::Validation(format!(
            "unsupported memory candidate decision: {}",
            request.decision
        )));
    }
    if !request.source_refs.is_array() {
        return Err(BuddyError::Validation(
            "memory candidate source refs must be an array".to_owned(),
        ));
    }

    Ok(())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
