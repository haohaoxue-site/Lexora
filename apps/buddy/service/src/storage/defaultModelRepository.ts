import type { DatabaseSync } from 'node:sqlite'
import type { BuddyThinkingLevel } from '../../../shared/modelSelection'

export interface DefaultModelRecord {
  providerId: string
  modelId: string
  reasoning: BuddyThinkingLevel | null
  updatedAt: string
}

export interface DefaultModelRepository {
  clear: () => boolean
  find: () => DefaultModelRecord | null
  set: (record: DefaultModelRecord) => DefaultModelRecord
}

interface DefaultModelRow {
  provider_id: string
  model_id: string
  reasoning: BuddyThinkingLevel | null
  updated_at: string
}

export function createDefaultModelRepository(database: DatabaseSync): DefaultModelRepository {
  const clear = database.prepare('DELETE FROM default_model_setting WHERE singleton = 1')
  const find = database.prepare(`
    SELECT provider_id, model_id, reasoning, updated_at
    FROM default_model_setting
    WHERE singleton = 1
  `)
  const set = database.prepare(`
    INSERT INTO default_model_setting (singleton, provider_id, model_id, reasoning, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT (singleton) DO UPDATE SET
      provider_id = excluded.provider_id,
      model_id = excluded.model_id,
      reasoning = excluded.reasoning,
      updated_at = excluded.updated_at
  `)

  return {
    clear() {
      return Number(clear.run().changes) === 1
    },
    find() {
      const row = find.get() as DefaultModelRow | undefined
      return row ? toDefaultModel(row) : null
    },
    set(record) {
      set.run(record.providerId, record.modelId, record.reasoning, record.updatedAt)
      return requireDefaultModel(find.get())
    },
  }
}

function requireDefaultModel(value: unknown): DefaultModelRecord {
  const row = value as DefaultModelRow | undefined
  if (!row)
    throw new Error('Lexora Buddy default model was not persisted')
  return toDefaultModel(row)
}

function toDefaultModel(row: DefaultModelRow): DefaultModelRecord {
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    reasoning: row.reasoning,
    updatedAt: row.updated_at,
  }
}
