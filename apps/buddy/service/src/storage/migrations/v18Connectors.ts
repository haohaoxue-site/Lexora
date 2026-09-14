export const BUDDY_V18_CONNECTORS_SCHEMA_SQL = `
CREATE TABLE connector_tool_catalogs (
  connector_id TEXT PRIMARY KEY REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tools_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
