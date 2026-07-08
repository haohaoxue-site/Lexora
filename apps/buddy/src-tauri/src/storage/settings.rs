use rusqlite::{params, types::Type, Connection, OptionalExtension};

use crate::error::{BuddyError, BuddyResult};

use super::BuddyStorage;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddySetting {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: String,
}

impl BuddyStorage {
    pub fn write_setting_json(
        &self,
        key: &str,
        value: serde_json::Value,
    ) -> BuddyResult<BuddySetting> {
        self.with_connection("write_setting_json", |connection| {
            self::write_setting_json(connection, key, value)
        })
    }

    pub fn read_setting_json(&self, key: &str) -> BuddyResult<Option<BuddySetting>> {
        self.with_connection("read_setting_json", |connection| {
            self::read_setting_json(connection, key)
        })
    }
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

    read_setting_json(connection, key)?
        .ok_or_else(|| BuddyError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
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
    let value = serde_json::from_str(&value_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(1, Type::Text, Box::new(error))
    })?;

    Ok(BuddySetting {
        key: row.get(0)?,
        value,
        updated_at: row.get(2)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::read_setting_json;

    #[test]
    fn rejects_invalid_setting_json() {
        let connection = Connection::open_in_memory().expect("open memory database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE settings (
                  key TEXT PRIMARY KEY,
                  value_json TEXT NOT NULL,
                  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                );
                INSERT INTO settings(key, value_json) VALUES ('broken', '{');
                "#,
            )
            .expect("create settings fixture");

        let error = read_setting_json(&connection, "broken").expect_err("invalid json");

        assert!(matches!(error, crate::error::BuddyError::Sqlite(_)));
    }
}
