import type { DatabaseSync } from 'node:sqlite'

export interface ProviderStateRecord {
  providerId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderStateRepository {
  findByProviderId: (providerId: string) => ProviderStateRecord | null
  list: () => ProviderStateRecord[]
  remove: (providerId: string) => boolean
  upsert: (record: ProviderStateRecord) => ProviderStateRecord
}

interface ProviderStateRow {
  provider_id: string
  enabled: number
  created_at: string
  updated_at: string
}

export function createProviderStateRepository(database: DatabaseSync): ProviderStateRepository {
  const find = database.prepare('SELECT * FROM provider_states WHERE provider_id = ?')
  const list = database.prepare('SELECT * FROM provider_states ORDER BY created_at, provider_id')
  const remove = database.prepare('DELETE FROM provider_states WHERE provider_id = ?')
  const upsert = database.prepare(`
    INSERT INTO provider_states (provider_id, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (provider_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `)

  return {
    findByProviderId(providerId) {
      const row = find.get(providerId) as ProviderStateRow | undefined
      return row ? toProviderState(row) : null
    },
    list() {
      return (list.all() as unknown as ProviderStateRow[]).map(toProviderState)
    },
    remove(providerId) {
      return Number(remove.run(providerId).changes) === 1
    },
    upsert(record) {
      upsert.run(record.providerId, Number(record.enabled), record.createdAt, record.updatedAt)
      return requireProviderState(find.get(record.providerId))
    },
  }
}

function requireProviderState(value: unknown): ProviderStateRecord {
  const row = value as ProviderStateRow | undefined
  if (!row)
    throw new Error('Lexora Buddy provider state was not persisted')
  return toProviderState(row)
}

function toProviderState(row: ProviderStateRow): ProviderStateRecord {
  return {
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
