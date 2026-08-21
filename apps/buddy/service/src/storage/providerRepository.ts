import type { DatabaseSync } from 'node:sqlite'
import type { BuddyThinkingLevel } from '../../../shared/modelSelection'

export interface ProviderConfigRecord {
  id: string
  displayName: string
  description: string | null
  api: string
  baseUrl: string
  models: unknown[]
  credentialRef: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type ProviderModelSource = 'builtin' | 'manual' | 'synced'

export interface ProviderStateRecord {
  providerId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderModelStateRecord {
  providerId: string
  modelId: string
  displayName: string
  api: string
  input: Array<'text' | 'image'>
  reasoning: boolean
  cost: { input: number, output: number, cacheRead: number, cacheWrite: number }
  sourceContextWindow: number
  sourceMaxTokens: number
  overrideContextWindow: number | null
  overrideMaxTokens: number | null
  sourceRevision: string
  acknowledgedSourceRevision: string | null
  source: ProviderModelSource
  enabled: boolean
  available: boolean
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DefaultModelRecord {
  providerId: string
  modelId: string
  reasoning: BuddyThinkingLevel | null
  updatedAt: string
}

export interface ProviderRepository {
  clearDefaultModel: () => boolean
  findById: (id: string) => ProviderConfigRecord | null
  findDefaultModel: () => DefaultModelRecord | null
  findModelState: (providerId: string, modelId: string) => ProviderModelStateRecord | null
  findState: (providerId: string) => ProviderStateRecord | null
  list: () => ProviderConfigRecord[]
  listModelStates: (providerId?: string) => ProviderModelStateRecord[]
  listStates: () => ProviderStateRecord[]
  remove: (id: string) => boolean
  removeModelState: (providerId: string, modelId: string) => boolean
  removeModelStates: (providerId: string) => number
  removeState: (providerId: string) => boolean
  setDefaultModel: (record: DefaultModelRecord) => DefaultModelRecord
  upsert: (record: ProviderConfigRecord) => ProviderConfigRecord
  upsertModelState: (record: ProviderModelStateRecord) => ProviderModelStateRecord
  upsertState: (record: ProviderStateRecord) => ProviderStateRecord
}

interface ProviderRow {
  id: string
  display_name: string
  description: string | null
  api: string
  base_url: string
  models_json: string
  credential_ref: string | null
  enabled: number
  created_at: string
  updated_at: string
}

interface ProviderStateRow {
  provider_id: string
  enabled: number
  created_at: string
  updated_at: string
}

interface ProviderModelStateRow {
  provider_id: string
  model_id: string
  display_name: string
  api: string
  input_json: string
  reasoning: number
  cost_json: string
  context_window: number
  max_tokens: number
  override_context_window: number | null
  override_max_tokens: number | null
  source_revision: string
  acknowledged_source_revision: string | null
  source: ProviderModelSource
  enabled: number
  available: number
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

interface DefaultModelRow {
  provider_id: string
  model_id: string
  reasoning: BuddyThinkingLevel | null
  updated_at: string
}

export function createProviderRepository(database: DatabaseSync): ProviderRepository {
  const find = database.prepare('SELECT * FROM provider_configs WHERE id = ?')
  const list = database.prepare('SELECT * FROM provider_configs ORDER BY display_name, id')
  const remove = database.prepare('DELETE FROM provider_configs WHERE id = ?')
  const upsert = database.prepare(`
    INSERT INTO provider_configs (
      id, display_name, description, api, base_url, models_json,
      credential_ref, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      display_name = excluded.display_name,
      description = excluded.description,
      api = excluded.api,
      base_url = excluded.base_url,
      models_json = excluded.models_json,
      credential_ref = excluded.credential_ref,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `)
  const findState = database.prepare('SELECT * FROM provider_states WHERE provider_id = ?')
  const listStates = database.prepare('SELECT * FROM provider_states ORDER BY created_at, provider_id')
  const removeState = database.prepare('DELETE FROM provider_states WHERE provider_id = ?')
  const upsertState = database.prepare(`
    INSERT INTO provider_states (provider_id, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (provider_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `)
  const findModelState = database.prepare(`
    SELECT * FROM provider_model_states WHERE provider_id = ? AND model_id = ?
  `)
  const listAllModelStates = database.prepare(`
    SELECT * FROM provider_model_states ORDER BY provider_id, display_name, model_id
  `)
  const listProviderModelStates = database.prepare(`
    SELECT * FROM provider_model_states
    WHERE provider_id = ?
    ORDER BY display_name, model_id
  `)
  const removeModelState = database.prepare(`
    DELETE FROM provider_model_states WHERE provider_id = ? AND model_id = ?
  `)
  const removeModelStates = database.prepare(`
    DELETE FROM provider_model_states WHERE provider_id = ?
  `)
  const upsertModelState = database.prepare(`
    INSERT INTO provider_model_states (
      provider_id, model_id, display_name, api, input_json, reasoning, cost_json,
      context_window, max_tokens, override_context_window, override_max_tokens,
      source_revision, acknowledged_source_revision, source, enabled, available,
      last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (provider_id, model_id) DO UPDATE SET
      display_name = excluded.display_name,
      api = excluded.api,
      input_json = excluded.input_json,
      reasoning = excluded.reasoning,
      cost_json = excluded.cost_json,
      context_window = excluded.context_window,
      max_tokens = excluded.max_tokens,
      override_context_window = excluded.override_context_window,
      override_max_tokens = excluded.override_max_tokens,
      source_revision = excluded.source_revision,
      acknowledged_source_revision = excluded.acknowledged_source_revision,
      source = excluded.source,
      enabled = excluded.enabled,
      available = excluded.available,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `)
  const findDefaultModel = database.prepare(`
    SELECT provider_id, model_id, reasoning, updated_at
    FROM default_model_setting
    WHERE singleton = 1
  `)
  const clearDefaultModel = database.prepare('DELETE FROM default_model_setting WHERE singleton = 1')
  const setDefaultModel = database.prepare(`
    INSERT INTO default_model_setting (singleton, provider_id, model_id, reasoning, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT (singleton) DO UPDATE SET
      provider_id = excluded.provider_id,
      model_id = excluded.model_id,
      reasoning = excluded.reasoning,
      updated_at = excluded.updated_at
  `)

  return {
    clearDefaultModel() {
      return Number(clearDefaultModel.run().changes) === 1
    },
    findById(id) {
      const row = find.get(id) as ProviderRow | undefined
      return row ? toProvider(row) : null
    },
    findDefaultModel() {
      const row = findDefaultModel.get() as DefaultModelRow | undefined
      return row ? toDefaultModel(row) : null
    },
    findModelState(providerId, modelId) {
      const row = findModelState.get(providerId, modelId) as ProviderModelStateRow | undefined
      return row ? toProviderModelState(row) : null
    },
    findState(providerId) {
      const row = findState.get(providerId) as ProviderStateRow | undefined
      return row ? toProviderState(row) : null
    },
    list() {
      return (list.all() as unknown as ProviderRow[]).map(toProvider)
    },
    listModelStates(providerId) {
      const rows = providerId
        ? listProviderModelStates.all(providerId)
        : listAllModelStates.all()
      return (rows as unknown as ProviderModelStateRow[]).map(toProviderModelState)
    },
    listStates() {
      return (listStates.all() as unknown as ProviderStateRow[]).map(toProviderState)
    },
    remove(id) {
      return Number(remove.run(id).changes) === 1
    },
    removeModelState(providerId, modelId) {
      return Number(removeModelState.run(providerId, modelId).changes) === 1
    },
    removeModelStates(providerId) {
      return Number(removeModelStates.run(providerId).changes)
    },
    removeState(providerId) {
      return Number(removeState.run(providerId).changes) === 1
    },
    setDefaultModel(record) {
      setDefaultModel.run(record.providerId, record.modelId, record.reasoning, record.updatedAt)
      return requireDefaultModel(findDefaultModel.get())
    },
    upsert(record) {
      upsert.run(
        record.id,
        record.displayName,
        record.description,
        record.api,
        record.baseUrl,
        JSON.stringify(record.models),
        record.credentialRef,
        Number(record.enabled),
        record.createdAt,
        record.updatedAt,
      )
      return requireProvider(find.get(record.id), record.id)
    },
    upsertModelState(record) {
      upsertModelState.run(
        record.providerId,
        record.modelId,
        record.displayName,
        record.api,
        JSON.stringify(record.input),
        Number(record.reasoning),
        JSON.stringify(record.cost),
        record.sourceContextWindow,
        record.sourceMaxTokens,
        record.overrideContextWindow,
        record.overrideMaxTokens,
        record.sourceRevision,
        record.acknowledgedSourceRevision,
        record.source,
        Number(record.enabled),
        Number(record.available),
        record.lastSeenAt,
        record.createdAt,
        record.updatedAt,
      )
      return requireProviderModelState(findModelState.get(record.providerId, record.modelId))
    },
    upsertState(record) {
      upsertState.run(record.providerId, Number(record.enabled), record.createdAt, record.updatedAt)
      return requireProviderState(findState.get(record.providerId))
    },
  }
}

function requireProvider(value: unknown, id: string): ProviderConfigRecord {
  const row = value as ProviderRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy provider was not persisted: ${id}`)
  return toProvider(row)
}

function toProvider(row: ProviderRow): ProviderConfigRecord {
  const models: unknown = JSON.parse(row.models_json)
  if (!Array.isArray(models))
    throw new Error(`Lexora Buddy provider models are invalid: ${row.id}`)

  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    api: row.api,
    baseUrl: row.base_url,
    models,
    credentialRef: row.credential_ref,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requireProviderState(value: unknown): ProviderStateRecord {
  const row = value as ProviderStateRow | undefined
  if (!row)
    throw new Error('Lexora Buddy provider state was not persisted')
  return toProviderState(row)
}

function requireProviderModelState(value: unknown): ProviderModelStateRecord {
  const row = value as ProviderModelStateRow | undefined
  if (!row)
    throw new Error('Lexora Buddy provider model state was not persisted')
  return toProviderModelState(row)
}

function requireDefaultModel(value: unknown): DefaultModelRecord {
  const row = value as DefaultModelRow | undefined
  if (!row)
    throw new Error('Lexora Buddy default model was not persisted')
  return toDefaultModel(row)
}

function toProviderState(row: ProviderStateRow): ProviderStateRecord {
  return {
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toProviderModelState(row: ProviderModelStateRow): ProviderModelStateRecord {
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    api: row.api,
    input: JSON.parse(row.input_json) as Array<'text' | 'image'>,
    reasoning: row.reasoning === 1,
    cost: JSON.parse(row.cost_json) as ProviderModelStateRecord['cost'],
    sourceContextWindow: row.context_window,
    sourceMaxTokens: row.max_tokens,
    overrideContextWindow: row.override_context_window,
    overrideMaxTokens: row.override_max_tokens,
    sourceRevision: row.source_revision,
    acknowledgedSourceRevision: row.acknowledged_source_revision,
    source: row.source,
    enabled: row.enabled === 1,
    available: row.available === 1,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDefaultModel(row: DefaultModelRow): DefaultModelRecord {
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    reasoning: row.reasoning,
    updatedAt: row.updated_at,
  }
}
