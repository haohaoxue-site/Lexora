use rusqlite::{params, types::Type, Connection};
use uuid::Uuid;

use crate::error::{BuddyError, BuddyResult};

pub const CODEX_APP_SERVER_REQUEST_APPROVAL_KIND: &str = "run.codex_app_server_request";

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyApprovalRequest {
    pub run_id: Option<String>,
    pub kind: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyApproval {
    pub id: String,
    pub run_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub payload: serde_json::Value,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

pub fn create_approval(
    connection: &Connection,
    request: CreateBuddyApprovalRequest,
) -> BuddyResult<BuddyApproval> {
    let id = Uuid::new_v4().to_string();
    let payload = serde_json::to_string(&request.payload)?;

    connection.execute(
        r#"
        INSERT INTO approvals(id, run_id, kind, status, payload_json)
        VALUES (?1, ?2, ?3, 'pending', ?4)
        "#,
        params![id, request.run_id, request.kind, payload],
    )?;

    find_approval(connection, &id)
}

pub fn find_approval(connection: &Connection, id: &str) -> BuddyResult<BuddyApproval> {
    Ok(connection.query_row(
        r#"
        SELECT id, run_id, kind, status, payload_json, created_at, resolved_at
        FROM approvals
        WHERE id = ?1
        "#,
        params![id],
        map_approval,
    )?)
}

pub fn list_approvals(
    connection: &Connection,
    status: Option<String>,
    limit: i64,
) -> BuddyResult<Vec<BuddyApproval>> {
    let limit = limit.clamp(1, 100);

    if let Some(status) = status {
        validate_approval_status(&status)?;
        let mut statement = connection.prepare(
            r#"
            SELECT id, run_id, kind, status, payload_json, created_at, resolved_at
            FROM approvals
            WHERE status = ?1
            ORDER BY created_at DESC, rowid DESC
            LIMIT ?2
            "#,
        )?;
        let approvals = statement
            .query_map(params![status, limit], map_approval)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(approvals);
    }

    let mut statement = connection.prepare(
        r#"
        SELECT id, run_id, kind, status, payload_json, created_at, resolved_at
        FROM approvals
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?1
        "#,
    )?;
    let approvals = statement
        .query_map(params![limit], map_approval)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(approvals)
}

pub fn resolve_approval(
    connection: &Connection,
    id: &str,
    status: &str,
) -> BuddyResult<BuddyApproval> {
    validate_approval_status(status)?;
    connection.execute(
        r#"
        UPDATE approvals
        SET status = ?1,
            resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?2 AND status = 'pending'
        "#,
        params![status, id],
    )?;

    let approval = find_approval(connection, id)?;
    if approval.status != status {
        return Err(BuddyError::Validation("approval is not pending".to_owned()));
    }

    Ok(approval)
}

fn map_approval(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyApproval> {
    let payload_json: String = row.get(4)?;
    let payload = serde_json::from_str(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, Type::Text, Box::new(error))
    })?;

    Ok(BuddyApproval {
        id: row.get(0)?,
        run_id: row.get(1)?,
        kind: row.get(2)?,
        status: row.get(3)?,
        payload,
        created_at: row.get(5)?,
        resolved_at: row.get(6)?,
    })
}

fn validate_approval_status(status: &str) -> BuddyResult<()> {
    if matches!(status, "pending" | "approved" | "denied" | "cancelled") {
        return Ok(());
    }

    Err(BuddyError::Validation(
        "approval status is invalid".to_owned(),
    ))
}
