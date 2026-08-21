import type { DatabaseSync } from 'node:sqlite'

export type McpTransport = 'stdio' | 'streamable-http'

export interface McpServerRecord {
  id: string
  name: string
  transport: McpTransport
  command: string | null
  args: string[] | null
  cwd: string | null
  url: string | null
  credentialRef: string | null
  trustedAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ConnectorRepository {
  findById: (id: string) => McpServerRecord | null
  list: () => McpServerRecord[]
  remove: (id: string) => boolean
  trust: (id: string, trustedAt: string) => boolean
  upsert: (record: McpServerRecord) => McpServerRecord
}

interface McpServerRow {
  id: string
  name: string
  transport: McpTransport
  command: string | null
  args_json: string | null
  cwd: string | null
  url: string | null
  credential_ref: string | null
  trusted_at: string | null
  enabled: number
  created_at: string
  updated_at: string
}

export function createConnectorRepository(database: DatabaseSync): ConnectorRepository {
  const find = database.prepare('SELECT * FROM mcp_servers WHERE id = ?')
  const list = database.prepare('SELECT * FROM mcp_servers ORDER BY name, id')
  const remove = database.prepare('DELETE FROM mcp_servers WHERE id = ?')
  const upsert = database.prepare(`
    INSERT INTO mcp_servers (
      id, name, transport, command, args_json, cwd, url,
      credential_ref, trusted_at, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name,
      transport = excluded.transport,
      command = excluded.command,
      args_json = excluded.args_json,
      cwd = excluded.cwd,
      url = excluded.url,
      credential_ref = excluded.credential_ref,
      trusted_at = excluded.trusted_at,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `)
  const trust = database.prepare(`
    UPDATE mcp_servers SET trusted_at = ?, updated_at = ? WHERE id = ?
  `)

  return {
    findById(id) {
      const row = find.get(id) as McpServerRow | undefined
      return row ? toMcpServer(row) : null
    },
    list() {
      return (list.all() as unknown as McpServerRow[]).map(toMcpServer)
    },
    remove(id) {
      return Number(remove.run(id).changes) === 1
    },
    upsert(record) {
      upsert.run(
        record.id,
        record.name,
        record.transport,
        record.command,
        record.args ? JSON.stringify(record.args) : null,
        record.cwd,
        record.url,
        record.credentialRef,
        record.trustedAt,
        Number(record.enabled),
        record.createdAt,
        record.updatedAt,
      )
      return requireMcpServer(find.get(record.id), record.id)
    },
    trust(id, trustedAt) {
      return Number(trust.run(trustedAt, trustedAt, id).changes) === 1
    },
  }
}

function requireMcpServer(value: unknown, id: string): McpServerRecord {
  const row = value as McpServerRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy MCP server was not persisted: ${id}`)
  return toMcpServer(row)
}

function toMcpServer(row: McpServerRow): McpServerRecord {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command,
    args: parseStringArray(row.args_json, row.id),
    cwd: row.cwd,
    url: row.url,
    credentialRef: row.credential_ref,
    trustedAt: row.trusted_at,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseStringArray(value: string | null, id: string): string[] | null {
  if (value === null)
    return null
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string'))
    throw new Error(`Lexora Buddy MCP args are invalid: ${id}`)
  return parsed
}
