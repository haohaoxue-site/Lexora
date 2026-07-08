#![cfg_attr(not(test), allow(dead_code))]

use rusqlite::{params, types::Type, Connection};
use uuid::Uuid;

use crate::error::BuddyResult;

const MEMORY_ITEM_COLUMNS: &str = r#"
  id,
  scope,
  memory_type,
  content,
  tags_json,
  source_project,
  source_run_id,
  confidence,
  created_at,
  updated_at,
  expires_at
"#;

const MEMORY_ITEM_COLUMNS_WITH_ALIAS: &str = r#"
  m.id,
  m.scope,
  m.memory_type,
  m.content,
  m.tags_json,
  m.source_project,
  m.source_run_id,
  m.confidence,
  m.created_at,
  m.updated_at,
  m.expires_at
"#;

#[derive(Clone, Copy)]
enum MemorySourceProjectFilter<'a> {
    GlobalOnly,
    GlobalAndProject(&'a str),
}

impl<'a> MemorySourceProjectFilter<'a> {
    fn from_source_project(source_project: Option<&'a str>) -> Self {
        match source_project {
            Some(source_project) => Self::GlobalAndProject(source_project),
            None => Self::GlobalOnly,
        }
    }

    fn source_project(self) -> Option<&'a str> {
        match self {
            Self::GlobalOnly => None,
            Self::GlobalAndProject(source_project) => Some(source_project),
        }
    }

    fn search_where_clause(self) -> &'static str {
        match self {
            Self::GlobalOnly => "memory_search MATCH ?1 AND m.source_project IS NULL",
            Self::GlobalAndProject(_) => {
                "memory_search MATCH ?1 AND (m.source_project IS NULL OR m.source_project = ?2)"
            }
        }
    }

    fn search_limit_parameter(self) -> &'static str {
        match self {
            Self::GlobalOnly => "?2",
            Self::GlobalAndProject(_) => "?3",
        }
    }

    fn recent_where_clause(self) -> &'static str {
        match self {
            Self::GlobalOnly => "source_project IS NULL",
            Self::GlobalAndProject(_) => "source_project IS NULL OR source_project = ?1",
        }
    }

    fn recent_limit_parameter(self) -> &'static str {
        match self {
            Self::GlobalOnly => "?1",
            Self::GlobalAndProject(_) => "?2",
        }
    }
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyMemoryItemRequest {
    pub scope: String,
    pub memory_type: String,
    pub content: String,
    pub tags: Vec<String>,
    pub source_project: Option<String>,
    pub source_run_id: Option<String>,
    pub confidence: f64,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyMemoryItem {
    pub id: String,
    pub scope: String,
    pub memory_type: String,
    pub content: String,
    pub tags: Vec<String>,
    pub source_project: Option<String>,
    pub source_run_id: Option<String>,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn create_memory_item(
    connection: &mut Connection,
    request: CreateBuddyMemoryItemRequest,
) -> BuddyResult<BuddyMemoryItem> {
    let id = Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&request.tags)?;
    let searchable_tags = request.tags.join(" ");
    let transaction = connection.transaction()?;

    transaction.execute(
        r#"
        INSERT INTO memory_items(
          id,
          scope,
          memory_type,
          content,
          tags_json,
          source_project,
          source_run_id,
          confidence,
          expires_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            id,
            request.scope,
            request.memory_type,
            request.content,
            tags_json,
            request.source_project,
            request.source_run_id,
            request.confidence,
            request.expires_at
        ],
    )?;
    transaction.execute(
        r#"
        INSERT INTO memory_search(memory_id, content, tags)
        VALUES (?1, ?2, ?3)
        "#,
        params![id, request.content, searchable_tags],
    )?;

    let item = find_memory_item(&transaction, &id)?;
    transaction.commit()?;

    Ok(item)
}

pub fn search_memory_items(
    connection: &Connection,
    query: &str,
    source_project: Option<&str>,
    limit: i64,
) -> BuddyResult<Vec<BuddyMemoryItem>> {
    let limit = limit.clamp(1, 20);
    let fts_query = build_fts_query(query);
    let source_project = normalized_memory_source_project(source_project);

    if fts_query.is_empty() {
        return list_recent_memory_items(connection, source_project.as_deref(), limit);
    }

    let filter = MemorySourceProjectFilter::from_source_project(source_project.as_deref());
    let sql = format!(
        r#"
        SELECT {MEMORY_ITEM_COLUMNS_WITH_ALIAS}
        FROM memory_search
        JOIN memory_items m ON m.id = memory_search.memory_id
        WHERE {}
        ORDER BY bm25(memory_search), m.updated_at DESC
        LIMIT {}
        "#,
        filter.search_where_clause(),
        filter.search_limit_parameter()
    );
    let mut statement = connection.prepare(&sql)?;
    if let Some(source_project) = filter.source_project() {
        let items = statement
            .query_map(params![fts_query, source_project, limit], map_memory_item)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(items);
    }

    let items = statement
        .query_map(params![fts_query, limit], map_memory_item)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(items)
}

fn list_recent_memory_items(
    connection: &Connection,
    source_project: Option<&str>,
    limit: i64,
) -> BuddyResult<Vec<BuddyMemoryItem>> {
    let filter = MemorySourceProjectFilter::from_source_project(source_project);
    let sql = format!(
        r#"
        SELECT {MEMORY_ITEM_COLUMNS}
        FROM memory_items
        WHERE {}
        ORDER BY updated_at DESC, rowid DESC
        LIMIT {}
        "#,
        filter.recent_where_clause(),
        filter.recent_limit_parameter()
    );
    let mut statement = connection.prepare(&sql)?;
    if let Some(source_project) = filter.source_project() {
        let items = statement
            .query_map(params![source_project, limit], map_memory_item)?
            .collect::<Result<Vec<_>, _>>()?;

        return Ok(items);
    }

    let items = statement
        .query_map(params![limit], map_memory_item)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(items)
}

fn normalized_memory_source_project(source_project: Option<&str>) -> Option<String> {
    source_project
        .map(str::trim)
        .filter(|source_project| !source_project.is_empty())
        .map(str::to_owned)
}

#[cfg_attr(not(test), allow(dead_code))]
fn find_memory_item(connection: &Connection, id: &str) -> BuddyResult<BuddyMemoryItem> {
    let sql = format!(
        r#"
        SELECT {MEMORY_ITEM_COLUMNS}
        FROM memory_items
        WHERE id = ?1
        "#
    );
    Ok(connection.query_row(&sql, params![id], map_memory_item)?)
}

fn map_memory_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<BuddyMemoryItem> {
    let tags_json: String = row.get(4)?;
    let tags = serde_json::from_str(&tags_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, Type::Text, Box::new(error))
    })?;

    Ok(BuddyMemoryItem {
        id: row.get(0)?,
        scope: row.get(1)?,
        memory_type: row.get(2)?,
        content: row.get(3)?,
        tags,
        source_project: row.get(5)?,
        source_run_id: row.get(6)?,
        confidence: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        expires_at: row.get(10)?,
    })
}

fn build_fts_query(query: &str) -> String {
    let terms = query
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .take(8)
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>();

    terms.join(" OR ")
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{create_memory_item, find_memory_item, CreateBuddyMemoryItemRequest};

    #[test]
    fn rolls_back_memory_item_when_search_index_insert_fails() {
        let mut connection = Connection::open_in_memory().expect("open memory database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE memory_items (
                  id TEXT PRIMARY KEY,
                  scope TEXT NOT NULL,
                  memory_type TEXT NOT NULL,
                  content TEXT NOT NULL,
                  tags_json TEXT NOT NULL DEFAULT '[]',
                  source_project TEXT,
                  source_run_id TEXT,
                  confidence REAL NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                  expires_at TEXT
                );
                "#,
            )
            .expect("create memory_items table");

        let result = create_memory_item(
            &mut connection,
            CreateBuddyMemoryItemRequest {
                confidence: 0.9,
                content: "Buddy should not persist orphaned memory rows.".to_owned(),
                expires_at: None,
                memory_type: "continuity.chat_turn".to_owned(),
                scope: "global".to_owned(),
                source_project: None,
                source_run_id: None,
                tags: vec!["buddy".to_owned()],
            },
        );
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM memory_items", [], |row| row.get(0))
            .expect("count memory items");

        assert!(result.is_err());
        assert_eq!(count, 0);
    }

    #[test]
    fn rejects_invalid_memory_item_tags_json() {
        let connection = Connection::open_in_memory().expect("open memory database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE memory_items (
                  id TEXT PRIMARY KEY,
                  scope TEXT NOT NULL,
                  memory_type TEXT NOT NULL,
                  content TEXT NOT NULL,
                  tags_json TEXT NOT NULL DEFAULT '[]',
                  source_project TEXT,
                  source_run_id TEXT,
                  confidence REAL NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                  expires_at TEXT
                );
                INSERT INTO memory_items(id, scope, memory_type, content, tags_json)
                VALUES ('memory-1', 'global', 'continuity.chat_turn', 'broken tags', '{');
                "#,
            )
            .expect("create memory_items fixture");

        let error = find_memory_item(&connection, "memory-1").expect_err("invalid tags json");

        assert!(matches!(error, crate::error::BuddyError::Sqlite(_)));
    }
}
