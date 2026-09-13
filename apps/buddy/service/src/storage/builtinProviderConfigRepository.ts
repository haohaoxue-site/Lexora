import type { DatabaseSync } from 'node:sqlite'

export interface BuiltinProviderConfigRecord {
  id: string
  builtinProviderId: string
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export interface BuiltinProviderConfigRepository {
  findById: (id: string) => BuiltinProviderConfigRecord | null
  list: () => BuiltinProviderConfigRecord[]
  remove: (id: string) => void
  upsert: (record: BuiltinProviderConfigRecord) => void
}

export function createBuiltinProviderConfigRepository(database: DatabaseSync): BuiltinProviderConfigRepository {
  const columns = 'id, builtin_provider_id AS builtinProviderId, display_name AS displayName, created_at AS createdAt, updated_at AS updatedAt'
  const find = database.prepare(`SELECT ${columns} FROM builtin_provider_configs WHERE id = ?`)
  const list = database.prepare(`SELECT ${columns} FROM builtin_provider_configs ORDER BY created_at, id`)
  const remove = database.prepare('DELETE FROM builtin_provider_configs WHERE id = ?')
  const upsert = database.prepare(`
    INSERT INTO builtin_provider_configs (id, builtin_provider_id, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
  `)
  return {
    findById: id => find.get(id) as BuiltinProviderConfigRecord | undefined ?? null,
    list: () => list.all() as unknown as BuiltinProviderConfigRecord[],
    remove: (id) => { remove.run(id) },
    upsert: (record) => {
      upsert.run(record.id, record.builtinProviderId, record.displayName, record.createdAt, record.updatedAt)
    },
  }
}
