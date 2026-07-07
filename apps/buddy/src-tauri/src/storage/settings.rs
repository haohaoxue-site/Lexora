use rusqlite::{params, Connection, OptionalExtension};

use crate::error::BuddyResult;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddySetting {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: String,
}

pub fn write_setting_json(
    connection: &Connection,
    key: &str,
    value: serde_json::Value,
) -> BuddyResult<BuddySetting> {
    let value_json = serde_json::to_string(&value)?;
    connection.execute(
        r#"
        INSERT INTO settings(key, value_json)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        "#,
        params![key, value_json],
    )?;

    read_setting_json(connection, key).map(|setting| setting.expect("setting was just written"))
}

pub fn read_setting_json(connection: &Connection, key: &str) -> BuddyResult<Option<BuddySetting>> {
    connection
        .query_row(
            r#"
            SELECT key, value_json, updated_at
            FROM settings
            WHERE key = ?1
            "#,
            params![key],
            map_setting,
        )
        .optional()
        .map_err(Into::into)
}

fn map_setting(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddySetting> {
    let value_json: String = row.get(1)?;
    let value = serde_json::from_str(&value_json).unwrap_or(serde_json::Value::Null);

    Ok(BuddySetting {
        key: row.get(0)?,
        value,
        updated_at: row.get(2)?,
    })
}
