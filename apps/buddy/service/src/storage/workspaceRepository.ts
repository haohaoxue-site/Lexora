import type { DatabaseSync } from 'node:sqlite'

export interface WorkspaceRepository {
  delete: (key: string) => boolean
  get: <T = unknown>(key: string) => T | null
  getRecord: <T = unknown>(key: string) => WorkspaceSettingRecord<T> | null
  listKeys: () => string[]
  set: (key: string, value: unknown, updatedAt: string) => void
}

export interface WorkspaceSettingRecord<T = unknown> {
  key: string
  updatedAt: string
  value: T
}

export function createWorkspaceRepository(database: DatabaseSync): WorkspaceRepository {
  const find = database.prepare('SELECT key, value_json, updated_at FROM workspace_settings WHERE key = ?')
  const list = database.prepare('SELECT key FROM workspace_settings ORDER BY key')
  const remove = database.prepare('DELETE FROM workspace_settings WHERE key = ?')
  const upsert = database.prepare(`
    INSERT INTO workspace_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `)

  return {
    delete(key) {
      return Number(remove.run(key).changes) === 1
    },
    get<T = unknown>(key: string): T | null {
      const row = find.get(key) as WorkspaceSettingRow | undefined
      return row ? JSON.parse(row.value_json) as T : null
    },
    getRecord<T = unknown>(key: string): WorkspaceSettingRecord<T> | null {
      const row = find.get(key) as WorkspaceSettingRow | undefined
      return row
        ? { key: row.key, updatedAt: row.updated_at, value: JSON.parse(row.value_json) as T }
        : null
    },
    listKeys() {
      return (list.all() as unknown as Array<{ key: string }>).map(row => row.key)
    },
    set(key, value, updatedAt) {
      upsert.run(key, JSON.stringify(value), updatedAt)
    },
  }
}

interface WorkspaceSettingRow {
  key: string
  updated_at: string
  value_json: string
}
