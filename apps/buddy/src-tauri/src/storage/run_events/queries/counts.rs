use std::collections::HashMap;

use rusqlite::{params_from_iter, Connection};

use crate::error::BuddyResult;

use super::super::BuddyRunEventCount;

pub(super) fn count_run_events(
    connection: &Connection,
    run_ids: Vec<String>,
) -> BuddyResult<Vec<BuddyRunEventCount>> {
    if run_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat_n("?", run_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        r#"
        SELECT run_id, COUNT(*)
        FROM run_events
        WHERE run_id IN ({placeholders})
        GROUP BY run_id
        "#
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map(params_from_iter(run_ids.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let counts = rows.into_iter().collect::<HashMap<_, _>>();

    Ok(run_ids
        .into_iter()
        .map(|run_id| BuddyRunEventCount {
            event_count: counts.get(&run_id).copied().unwrap_or(0),
            run_id,
        })
        .collect())
}
