import type { Api, Model } from '@earendil-works/pi-ai'
import type {
  ProviderConfigRecord,
  ProviderConfigRepository,
} from '../storage/providerConfigRepository'
import type {
  ProviderModelStateRecord,
  ProviderModelStateRepository,
} from '../storage/providerModelStateRepository'
import type {
  BuddyModel,
  ModelParametersOverride,
  ParsedCustomProviderInput,
  ProviderModelInput,
} from './providerSchemas'
import { ProviderUnavailableError, ProviderValidationError } from './ProviderFailure'
import {
  buddyModelSchema,
  customProviderInputSchema,
  customProviderModelSchema,
  modelParametersOverrideSchema,
  providerModelInputSchema,
} from './providerSchemas'

export interface ProviderRegistration {
  api: string
  baseUrl: string
  models: Array<{
    id: string
    name: string
    reasoning: boolean
    input: Array<'text' | 'image'>
    cost: { input: number, output: number, cacheRead: number, cacheWrite: number }
    contextWindow: number
    maxTokens: number
  }>
  name: string
}

export interface ProviderModelCatalogRuntime {
  getModels: (providerId?: string) => readonly Model<Api>[]
  registerProvider: (providerId: string, config: ProviderRegistration) => void
}

export interface ProviderModelSummary {
  readonly enabledModelCount: number
  readonly modelCount: number
}

export interface ProviderModelCatalogOptions {
  readonly configs: ProviderConfigRepository
  readonly modelRuntime: ProviderModelCatalogRuntime
  readonly models: ProviderModelStateRepository
}

export class ProviderModelCatalog {
  readonly #configs: ProviderConfigRepository
  readonly #modelRuntime: ProviderModelCatalogRuntime
  readonly #models: ProviderModelStateRepository

  constructor(options: ProviderModelCatalogOptions) {
    this.#configs = options.configs
    this.#modelRuntime = options.modelRuntime
    this.#models = options.models
  }

  list(providerId?: string): readonly BuddyModel[] {
    return this.#models.list(providerId).map(model => this.#toBuddyModel(model))
  }

  summarize(): ReadonlyMap<string, ProviderModelSummary> {
    const summaries = new Map<string, ProviderModelSummary>()
    for (const model of this.#models.list()) {
      const current = summaries.get(model.providerId)
      summaries.set(model.providerId, {
        enabledModelCount: (current?.enabledModelCount ?? 0)
          + Number(model.enabled && model.available),
        modelCount: (current?.modelCount ?? 0) + 1,
      })
    }
    return summaries
  }

  hasEnabledAvailableModel(providerId: string): boolean {
    return this.#models.list(providerId)
      .some(model => model.enabled && model.available)
  }

  isEnabledAvailable(providerId: string, modelId: string): boolean {
    const model = this.#models.find(providerId, modelId)
    return Boolean(model?.enabled && model.available)
  }

  removeForProvider(providerId: string): void {
    this.#models.removeForProvider(providerId)
  }

  registerCustomProvider(provider: ProviderConfigRecord): void {
    const input = toParsedCustomProvider(provider)
    this.#modelRuntime.registerProvider(provider.id, {
      api: input.api,
      baseUrl: input.baseUrl,
      models: input.models,
      name: input.displayName,
    })
  }

  seedStoredCustomModels(provider: ProviderConfigRecord): void {
    const now = new Date().toISOString()
    for (const value of provider.models) {
      const model = customProviderModelSchema.parse(value)
      const current = this.#models.find(provider.id, model.id)
      if (current)
        continue
      this.#models.upsert({
        acknowledgedSourceRevision: null,
        api: provider.api,
        available: true,
        cost: model.cost,
        createdAt: now,
        displayName: model.name,
        enabled: true,
        input: model.input,
        lastSeenAt: now,
        modelId: model.id,
        overrideContextWindow: null,
        overrideMaxTokens: null,
        providerId: provider.id,
        reasoning: model.reasoning,
        source: 'manual',
        sourceContextWindow: model.contextWindow,
        sourceMaxTokens: model.maxTokens,
        sourceRevision: now,
        updatedAt: now,
      })
    }
  }

  reconcileBuiltinModels(providerId: string): void {
    const now = new Date().toISOString()
    const runtimeModels = this.#modelRuntime.getModels(providerId)
    const seen = new Set(runtimeModels.map(model => model.id))
    for (const model of runtimeModels) {
      const current = this.#models.find(providerId, model.id)
      if (current?.source === 'manual')
        continue
      const sourceChanged = !current
        || current.sourceContextWindow !== model.contextWindow
        || current.sourceMaxTokens !== model.maxTokens
      this.#models.upsert({
        acknowledgedSourceRevision: current?.acknowledgedSourceRevision ?? null,
        api: model.api,
        available: true,
        cost: model.cost,
        createdAt: current?.createdAt ?? now,
        displayName: model.name,
        enabled: current?.enabled ?? false,
        input: [...model.input],
        lastSeenAt: now,
        modelId: model.id,
        overrideContextWindow: current?.overrideContextWindow ?? null,
        overrideMaxTokens: current?.overrideMaxTokens ?? null,
        providerId,
        reasoning: model.reasoning,
        source: 'builtin',
        sourceContextWindow: model.contextWindow,
        sourceMaxTokens: model.maxTokens,
        sourceRevision: sourceChanged
          ? nextSourceRevision(current?.sourceRevision, now)
          : current.sourceRevision,
        updatedAt: now,
      })
    }
    for (const current of this.#models.list(providerId)) {
      if (current.source === 'manual' || seen.has(current.modelId))
        continue
      this.#models.upsert({ ...current, available: false, updatedAt: now })
    }
  }

  reconcileSyncedModels(
    provider: ProviderConfigRecord,
    definitions: ReadonlyArray<{ id: string, name?: string }>,
  ): void {
    const now = new Date().toISOString()
    const seen = new Set(definitions.map(model => model.id))
    for (const definition of definitions) {
      const current = this.#models.find(provider.id, definition.id)
      if (current?.source === 'manual')
        continue
      this.#models.upsert({
        acknowledgedSourceRevision: current?.acknowledgedSourceRevision ?? null,
        api: provider.api,
        available: true,
        cost: current?.cost ?? { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        createdAt: current?.createdAt ?? now,
        displayName: definition.name?.trim() || definition.id,
        enabled: current?.enabled ?? false,
        input: current?.input ?? ['text'],
        lastSeenAt: now,
        modelId: definition.id,
        overrideContextWindow: current?.overrideContextWindow ?? null,
        overrideMaxTokens: current?.overrideMaxTokens ?? null,
        providerId: provider.id,
        reasoning: current?.reasoning ?? false,
        source: 'synced',
        sourceContextWindow: current?.sourceContextWindow ?? 128_000,
        sourceMaxTokens: current?.sourceMaxTokens ?? 16_384,
        sourceRevision: current?.sourceRevision ?? now,
        updatedAt: now,
      })
    }
    for (const current of this.#models.list(provider.id)) {
      if (current.source !== 'synced' || seen.has(current.modelId))
        continue
      this.#models.upsert({ ...current, available: false, updatedAt: now })
    }
    this.#updateCustomProviderModels(provider)
  }

  upsertManualModel(provider: ProviderConfigRecord, input: ProviderModelInput): BuddyModel {
    const model = providerModelInputSchema.parse(input)
    const now = new Date().toISOString()
    const current = this.#models.find(provider.id, model.id)
    const sourceChanged = !current
      || current.sourceContextWindow !== model.contextWindow
      || current.sourceMaxTokens !== model.maxTokens
    const next = this.#models.upsert({
      acknowledgedSourceRevision: current?.acknowledgedSourceRevision ?? null,
      api: provider.api,
      available: true,
      cost: model.cost,
      createdAt: current?.createdAt ?? now,
      displayName: model.name,
      enabled: current?.enabled ?? true,
      input: model.input,
      lastSeenAt: now,
      modelId: model.id,
      overrideContextWindow: current?.overrideContextWindow ?? null,
      overrideMaxTokens: current?.overrideMaxTokens ?? null,
      providerId: provider.id,
      reasoning: model.reasoning,
      source: 'manual',
      sourceContextWindow: model.contextWindow,
      sourceMaxTokens: model.maxTokens,
      sourceRevision: sourceChanged
        ? nextSourceRevision(current?.sourceRevision, now)
        : current.sourceRevision,
      updatedAt: now,
    })
    this.#updateCustomProviderModels(provider)
    return this.#toBuddyModel(next)
  }

  setParametersOverride(
    providerId: string,
    modelId: string,
    input: ModelParametersOverride,
  ): BuddyModel {
    const parsed = modelParametersOverrideSchema.safeParse(input)
    if (!parsed.success)
      throw new ProviderValidationError()
    const current = this.#requireModelState(providerId, modelId)
    const hadOverride = hasParameterOverride(current)
    const next = this.#models.upsert({
      ...current,
      acknowledgedSourceRevision: hadOverride
        ? current.acknowledgedSourceRevision
        : current.sourceRevision,
      overrideContextWindow: parsed.data.contextWindow,
      overrideMaxTokens: parsed.data.maxTokens,
      updatedAt: new Date().toISOString(),
    })
    return this.#toBuddyModel(next)
  }

  acknowledgeSourceUpdate(providerId: string, modelId: string): BuddyModel {
    const current = this.#requireModelState(providerId, modelId)
    if (!hasParameterOverride(current))
      throw new ProviderValidationError()
    return this.#toBuddyModel(this.#models.upsert({
      ...current,
      acknowledgedSourceRevision: current.sourceRevision,
      updatedAt: new Date().toISOString(),
    }))
  }

  restoreSourceParameters(providerId: string, modelId: string): BuddyModel {
    const current = this.#requireModelState(providerId, modelId)
    return this.#toBuddyModel(this.#models.upsert({
      ...current,
      acknowledgedSourceRevision: null,
      overrideContextWindow: null,
      overrideMaxTokens: null,
      updatedAt: new Date().toISOString(),
    }))
  }

  setEnabled(providerId: string, modelId: string, enabled: boolean): BuddyModel {
    this.assertCanSetEnabled(providerId, modelId, enabled)
    const current = this.#requireModelState(providerId, modelId)
    return this.#toBuddyModel(this.#models.upsert({
      ...current,
      enabled,
      updatedAt: new Date().toISOString(),
    }))
  }

  assertCanSetEnabled(providerId: string, modelId: string, enabled: boolean): void {
    const current = this.#models.find(providerId, modelId)
    if (!current || (enabled && !current.available))
      throw new ProviderUnavailableError()
  }

  resolve(providerId: string, modelId: string): Model<Api> {
    const model = this.#modelRuntime.getModels(providerId).find(candidate => candidate.id === modelId)
    if (!model || model.provider !== providerId)
      throw new ProviderUnavailableError()
    const state = this.#models.find(providerId, modelId)
    if (!state)
      return model
    const parameters = effectiveParameters(state)
    if (parameters.contextWindow === model.contextWindow && parameters.maxTokens === model.maxTokens)
      return model
    return { ...model, ...parameters }
  }

  #updateCustomProviderModels(provider: ProviderConfigRecord): void {
    const models = this.#models.list(provider.id)
      .filter(model => model.source !== 'builtin')
      .map(model => ({
        contextWindow: model.sourceContextWindow,
        cost: model.cost,
        id: model.modelId,
        input: model.input,
        maxTokens: model.sourceMaxTokens,
        name: model.displayName,
        reasoning: model.reasoning,
      }))
    const updated = this.#configs.upsert({
      ...provider,
      models,
      updatedAt: new Date().toISOString(),
    })
    this.registerCustomProvider(updated)
  }

  #toBuddyModel(model: ProviderModelStateRecord): BuddyModel {
    const parameters = effectiveParameters(model)
    return buddyModelSchema.parse({
      api: model.api,
      available: model.available,
      capabilities: [...model.input, ...(model.reasoning ? ['reasoning' as const] : [])],
      contextWindow: parameters.contextWindow,
      displayName: model.displayName,
      enabled: model.enabled,
      id: model.modelId,
      lastSeenAt: model.lastSeenAt,
      hasParameterOverride: hasParameterOverride(model),
      maxTokens: parameters.maxTokens,
      overrideContextWindow: model.overrideContextWindow,
      overrideMaxTokens: model.overrideMaxTokens,
      providerId: model.providerId,
      source: model.source,
      sourceContextWindow: model.sourceContextWindow,
      sourceMaxTokens: model.sourceMaxTokens,
      sourceParametersUpdated: hasParameterOverride(model)
        && model.acknowledgedSourceRevision !== model.sourceRevision,
    })
  }

  #requireModelState(providerId: string, modelId: string): ProviderModelStateRecord {
    const model = this.#models.find(providerId, modelId)
    if (!model)
      throw new ProviderUnavailableError()
    return model
  }
}

function hasParameterOverride(model: ProviderModelStateRecord): boolean {
  return model.overrideContextWindow !== null && model.overrideMaxTokens !== null
}

function effectiveParameters(model: ProviderModelStateRecord): ModelParametersOverride {
  if (hasParameterOverride(model)) {
    return {
      contextWindow: model.overrideContextWindow!,
      maxTokens: model.overrideMaxTokens!,
    }
  }
  return {
    contextWindow: model.sourceContextWindow,
    maxTokens: model.sourceMaxTokens,
  }
}

function nextSourceRevision(previous: string | undefined, candidate: string): string {
  if (!previous || candidate > previous)
    return candidate
  return new Date(Date.parse(previous) + 1).toISOString()
}

function toParsedCustomProvider(record: ProviderConfigRecord): ParsedCustomProviderInput {
  const models = record.models.map(model => customProviderModelSchema.parse(model))
  return customProviderInputSchema.parse({
    id: record.id,
    displayName: record.displayName,
    description: record.description ?? undefined,
    api: record.api,
    baseUrl: record.baseUrl,
    models,
    enabled: record.enabled,
  })
}
