import type {
  Api,
  AuthType,
  CredentialInfo,
  Model,
  Provider,
} from '@earendil-works/pi-ai'
import type { DatabaseSync } from 'node:sqlite'
import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type {
  ProviderConfigRecord,
  ProviderModelStateRecord,
  ProviderRepository,
} from '../storage/providerRepository'
import type {
  BuddyDefaultModel,
  BuddyModel,
  BuddyProvider,
  CustomProviderInput,
  ModelParametersOverride,
  ParsedCustomProviderInput,
  ProviderModelInput,
} from './providerSchemas'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createProviderRepository } from '../storage/providerRepository'
import { AuthInteractionService } from './AuthInteractionService'
import { HostCredentialStore, HostCredentialStoreError } from './HostCredentialStore'
import { clearAmbientProviderCredentials } from './providerEnvironment'
import {
  buddyModelSchema,
  buddyProviderSchema,
  customProviderInputSchema,
  customProviderModelSchema,
  defaultModelSchema,
  modelParametersOverrideSchema,
  providerModelInputSchema,
} from './providerSchemas'

interface ProviderRegistration {
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

export interface ProviderModelRuntime {
  getModels: (providerId?: string) => readonly Model<Api>[]
  getProvider: (providerId: string) => Provider | undefined
  getProviders: () => readonly Provider[]
  listCredentials: () => Promise<readonly CredentialInfo[]>
  login: ModelRuntime['login']
  logout: ModelRuntime['logout']
  registerProvider: (providerId: string, config: ProviderRegistration) => void
  unregisterProvider: (providerId: string) => void
}

export interface ProviderServiceOptions {
  authInteractions: AuthInteractionService
  getActiveRuns?: () => ReadonlyArray<{ model: string, provider: string }>
  modelRuntime: ProviderModelRuntime
  providers: ProviderRepository
  sessionRuntime?: ModelRuntime
  syncCustomModels?: (input: {
    api: string
    baseUrl: string
    providerId: string
  }) => Promise<ReadonlyArray<{ id: string, name?: string }>>
}

export interface CreateProviderServiceOptions {
  agentDirectory: string
  database: DatabaseSync
  getActiveRuns?: () => ReadonlyArray<{ model: string, provider: string }>
  peer: RuntimeRpcPeerContract
  providers?: ProviderRepository
}

export class ProviderService {
  readonly #authInteractions: AuthInteractionService
  readonly #getActiveRuns: () => ReadonlyArray<{ model: string, provider: string }>
  readonly #modelRuntime: ProviderModelRuntime
  readonly #providers: ProviderRepository
  readonly #sessionRuntime?: ModelRuntime
  readonly #syncCustomModels?: ProviderServiceOptions['syncCustomModels']

  constructor(options: ProviderServiceOptions) {
    this.#authInteractions = options.authInteractions
    this.#getActiveRuns = options.getActiveRuns ?? (() => [])
    this.#modelRuntime = options.modelRuntime
    this.#providers = options.providers
    this.#sessionRuntime = options.sessionRuntime
    this.#syncCustomModels = options.syncCustomModels
  }

  async initializeProviders(): Promise<void> {
    const customProviderIds = new Set<string>()
    for (const provider of this.#providers.list()) {
      customProviderIds.add(provider.id)
      this.#ensureProviderState(provider.id, provider.enabled)
      this.#seedStoredCustomModels(provider)
      this.#registerCustomProvider(provider)
    }
    const credentialProviderIds = new Set((await this.#modelRuntime.listCredentials().catch((error) => {
      if (error instanceof HostCredentialStoreError && error.code === 'CREDENTIAL_STORE_UNAVAILABLE')
        return []
      throw error
    })).map(credential => credential.providerId))
    for (const provider of this.#modelRuntime.getProviders()) {
      if (customProviderIds.has(provider.id)
        || (!this.#providers.findState(provider.id) && !credentialProviderIds.has(provider.id))) {
        continue
      }
      this.#ensureProviderState(provider.id, false)
      this.#reconcileRuntimeModels(provider.id, 'builtin')
    }
  }

  async listProviders(): Promise<readonly BuddyProvider[]> {
    const credentialList = await this.#modelRuntime.listCredentials().catch((error) => {
      if (error instanceof HostCredentialStoreError && error.code === 'CREDENTIAL_STORE_UNAVAILABLE')
        return []
      throw error
    })
    const credentials = new Map(credentialList
      .map(credential => [credential.providerId, credential.type]))
    const customProviders = new Map(this.#providers.list().map(provider => [provider.id, provider]))
    const providerStates = new Map(this.#providers.listStates().map(state => [state.providerId, state]))
    const modelStates = this.#providers.listModelStates()
    const modelStatesByProvider = Map.groupBy(modelStates, model => model.providerId)
    const providers = this.#modelRuntime.getProviders().map((provider) => {
      const custom = customProviders.get(provider.id)
      const state = providerStates.get(provider.id)
      const storedCredentialType = credentials.get(provider.id) ?? null
      const models = modelStatesByProvider.get(provider.id) ?? []
      const added = Boolean(state || custom || storedCredentialType)
      const enabled = state?.enabled ?? custom?.enabled ?? Boolean(storedCredentialType)
      const enabledModelCount = models.filter(model => model.enabled && model.available).length
      const syncUnavailableReason = this.#syncUnavailableReason(custom, storedCredentialType)
      const authTypes: Array<'api_key' | 'oauth'> = []
      if (provider.auth.apiKey)
        authTypes.push('api_key')
      if (provider.auth.oauth)
        authTypes.push('oauth')
      return buddyProviderSchema.parse({
        id: provider.id,
        api: custom?.api ?? null,
        description: custom?.description ?? null,
        displayName: provider.name,
        baseUrl: provider.baseUrl ?? null,
        canSyncModels: Boolean(custom && syncUnavailableReason === null),
        authTypes,
        storedCredentialType,
        status: storedCredentialType ? 'available' : 'authentication_required',
        custom: Boolean(custom),
        activeRunCount: this.#activeRunsForProvider(provider.id).length,
        added,
        enabled,
        enabledModelCount,
        modelCount: models.length,
        setupComplete: storedCredentialType !== null && enabledModelCount > 0,
        syncUnavailableReason,
      })
    })
    const registered = new Set(providers.map(provider => provider.id))
    for (const custom of customProviders.values()) {
      if (registered.has(custom.id))
        continue
      providers.push(buddyProviderSchema.parse({
        id: custom.id,
        api: custom.api,
        description: custom.description,
        displayName: custom.displayName,
        baseUrl: custom.baseUrl,
        canSyncModels: false,
        authTypes: ['api_key'],
        storedCredentialType: credentials.get(custom.id) ?? null,
        status: 'unavailable',
        custom: true,
        activeRunCount: this.#activeRunsForProvider(custom.id).length,
        added: true,
        enabled: providerStates.get(custom.id)?.enabled ?? custom.enabled,
        enabledModelCount: (modelStatesByProvider.get(custom.id) ?? [])
          .filter(model => model.enabled && model.available)
          .length,
        modelCount: (modelStatesByProvider.get(custom.id) ?? []).length,
        setupComplete: false,
        syncUnavailableReason: 'unsupported_api',
      }))
    }
    return providers.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  async listModels(providerId?: string): Promise<readonly BuddyModel[]> {
    return this.#providers.listModelStates(providerId).map(model => this.#toBuddyModel(model))
  }

  async addProvider(providerId: string): Promise<BuddyProvider> {
    if (!this.#modelRuntime.getProvider(providerId))
      throw new ProviderUnavailableError()
    this.#ensureProviderState(providerId, false)
    this.#reconcileRuntimeModels(providerId, 'builtin')
    return this.#requireListedProvider(providerId)
  }

  async upsertManualModel(providerId: string, input: ProviderModelInput): Promise<BuddyModel> {
    const custom = this.#providers.findById(providerId)
    if (!custom)
      throw new ProviderValidationError()
    const model = providerModelInputSchema.parse(input)
    const now = new Date().toISOString()
    const current = this.#providers.findModelState(providerId, model.id)
    const sourceChanged = !current
      || current.sourceContextWindow !== model.contextWindow
      || current.sourceMaxTokens !== model.maxTokens
    const next = this.#providers.upsertModelState({
      acknowledgedSourceRevision: current?.acknowledgedSourceRevision ?? null,
      api: custom.api,
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
      providerId,
      reasoning: model.reasoning,
      source: 'manual',
      sourceContextWindow: model.contextWindow,
      sourceMaxTokens: model.maxTokens,
      sourceRevision: sourceChanged
        ? nextSourceRevision(current?.sourceRevision, now)
        : current.sourceRevision,
      updatedAt: now,
    })
    this.#updateCustomProviderModels(custom)
    return this.#toBuddyModel(next)
  }

  async setModelParametersOverride(
    providerId: string,
    modelId: string,
    input: ModelParametersOverride,
  ): Promise<BuddyModel> {
    const parsed = modelParametersOverrideSchema.safeParse(input)
    if (!parsed.success)
      throw new ProviderValidationError()
    const current = this.#requireModelState(providerId, modelId)
    const hadOverride = hasParameterOverride(current)
    const next = this.#providers.upsertModelState({
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

  async acknowledgeModelSourceUpdate(providerId: string, modelId: string): Promise<BuddyModel> {
    const current = this.#requireModelState(providerId, modelId)
    if (!hasParameterOverride(current))
      throw new ProviderValidationError()
    return this.#toBuddyModel(this.#providers.upsertModelState({
      ...current,
      acknowledgedSourceRevision: current.sourceRevision,
      updatedAt: new Date().toISOString(),
    }))
  }

  async restoreModelSourceParameters(providerId: string, modelId: string): Promise<BuddyModel> {
    const current = this.#requireModelState(providerId, modelId)
    return this.#toBuddyModel(this.#providers.upsertModelState({
      ...current,
      acknowledgedSourceRevision: null,
      overrideContextWindow: null,
      overrideMaxTokens: null,
      updatedAt: new Date().toISOString(),
    }))
  }

  async setModelEnabled(providerId: string, modelId: string, enabled: boolean): Promise<BuddyModel> {
    const current = this.#providers.findModelState(providerId, modelId)
    if (!current || (enabled && !current.available))
      throw new ProviderUnavailableError()
    if (!enabled)
      this.#assertModelIdle(providerId, modelId)
    const next = this.#providers.upsertModelState({
      ...current,
      enabled,
      updatedAt: new Date().toISOString(),
    })
    if (!enabled)
      this.#clearDefaultIfMatches(providerId, modelId)
    return this.#toBuddyModel(next)
  }

  async setProviderEnabled(providerId: string, enabled: boolean): Promise<BuddyProvider> {
    const current = this.#providers.findState(providerId)
    if (!current)
      throw new ProviderUnavailableError()
    if (!enabled)
      this.#assertProviderIdle(providerId)
    if (enabled) {
      const credentials = await this.#modelRuntime.listCredentials()
      if (!credentials.some(credential => credential.providerId === providerId))
        throw new ProviderAuthenticationRequiredError()
      if (!this.#providers.listModelStates(providerId).some(model => model.enabled && model.available))
        throw new ProviderUnavailableError()
    }
    this.#providers.upsertState({
      ...current,
      enabled,
      updatedAt: new Date().toISOString(),
    })
    if (!enabled)
      this.#clearDefaultForProvider(providerId)
    return this.#requireListedProvider(providerId)
  }

  getDefaultModel(): Promise<BuddyDefaultModel | null> {
    const current = this.#providers.findDefaultModel()
    return Promise.resolve(current
      ? defaultModelSchema.parse({
          modelId: current.modelId,
          providerId: current.providerId,
          reasoning: current.reasoning,
        })
      : null)
  }

  async setDefaultModel(value: BuddyDefaultModel | null): Promise<BuddyDefaultModel | null> {
    if (!value) {
      this.#providers.clearDefaultModel()
      return null
    }
    const parsed = defaultModelSchema.parse(value)
    const provider = (await this.listProviders()).find(candidate => candidate.id === parsed.providerId)
    const model = this.#providers.findModelState(parsed.providerId, parsed.modelId)
    if (!provider?.added || !provider.enabled || provider.status !== 'available'
      || !model?.enabled || !model.available) {
      throw new ProviderUnavailableError()
    }
    const resolvedModel = this.resolveModel(parsed.providerId, parsed.modelId)
    if (
      parsed.reasoning !== null
      && !getSupportedThinkingLevels(resolvedModel).includes(parsed.reasoning)
    ) {
      throw new ProviderValidationError()
    }
    const stored = this.#providers.setDefaultModel({ ...parsed, updatedAt: new Date().toISOString() })
    return defaultModelSchema.parse({
      modelId: stored.modelId,
      providerId: stored.providerId,
      reasoning: stored.reasoning,
    })
  }

  async syncModels(providerId: string): Promise<readonly BuddyModel[]> {
    if (!this.#providers.findState(providerId))
      throw new ProviderUnavailableError()
    const custom = this.#providers.findById(providerId)
    if (!custom || !isCustomModelSyncSupported(custom.api) || !this.#syncCustomModels)
      throw new ProviderModelSyncUnsupportedError()
    const definitions = await this.#syncCustomModels({
      api: custom.api,
      baseUrl: custom.baseUrl,
      providerId,
    })
    this.#reconcileCustomSyncedModels(custom, definitions)
    return this.listModels(providerId)
  }

  getSessionRuntime(): ModelRuntime {
    if (!this.#sessionRuntime)
      throw new ProviderUnavailableError()
    return this.#sessionRuntime
  }

  resolveModel(providerId: string, modelId: string): Model<Api> {
    const model = this.#modelRuntime.getModels(providerId).find(candidate => candidate.id === modelId)
    if (!model || model.provider !== providerId)
      throw new ProviderUnavailableError()
    const state = this.#providers.findModelState(providerId, modelId)
    if (!state)
      return model
    const parameters = effectiveParameters(state)
    if (parameters.contextWindow === model.contextWindow && parameters.maxTokens === model.maxTokens)
      return model
    return { ...model, ...parameters }
  }

  resolveModelWithParameters(
    providerId: string,
    modelId: string,
    contextWindow: number | null,
    maxTokens: number | null,
  ): Model<Api> {
    const model = this.resolveModel(providerId, modelId)
    if (contextWindow === null || maxTokens === null)
      return model
    const parsed = modelParametersOverrideSchema.safeParse({ contextWindow, maxTokens })
    if (!parsed.success)
      throw new ProviderValidationError()
    return { ...model, ...parsed.data }
  }

  async assertModelAvailable(providerId: string, modelId: string): Promise<Model<Api>> {
    const provider = (await this.listProviders()).find(candidate => candidate.id === providerId)
    const model = this.#providers.findModelState(providerId, modelId)
    if (!provider?.added || !provider.enabled || provider.status === 'unavailable'
      || !model?.enabled || !model.available) {
      throw new ProviderUnavailableError()
    }
    if (provider.status === 'authentication_required')
      throw new ProviderAuthenticationRequiredError()
    return this.resolveModel(providerId, modelId)
  }

  async login(providerId: string, type: AuthType): Promise<void> {
    const provider = this.#modelRuntime.getProvider(providerId)
    if (!provider || !provider.auth[type === 'api_key' ? 'apiKey' : 'oauth'])
      throw new ProviderUnavailableError()

    const handle = this.#authInteractions.beginLogin(providerId)
    try {
      await this.#modelRuntime.login(providerId, type, handle.interaction)
    }
    finally {
      this.#authInteractions.completeLogin(handle.loginId)
    }
  }

  respondToPrompt(challengeId: string, value: string): Promise<void> {
    this.#authInteractions.respondToPrompt(challengeId, value)
    return Promise.resolve()
  }

  cancelLogin(challengeId: string): Promise<void> {
    this.#authInteractions.cancelLogin(challengeId)
    return Promise.resolve()
  }

  logout(providerId: string): Promise<void> {
    return this.#modelRuntime.logout(providerId)
  }

  async clearCredential(providerId: string): Promise<void> {
    this.#assertProviderIdle(providerId)
    await this.#modelRuntime.logout(providerId)
  }

  async removeProvider(providerId: string): Promise<void> {
    this.#assertProviderIdle(providerId)
    await this.#modelRuntime.logout(providerId)
    this.#clearDefaultForProvider(providerId)
    this.#providers.removeModelStates(providerId)
    this.#providers.removeState(providerId)
    if (this.#providers.findById(providerId)) {
      this.#providers.remove(providerId)
      this.#modelRuntime.unregisterProvider(providerId)
    }
  }

  async upsertCustomProvider(input: CustomProviderInput): Promise<BuddyProvider> {
    const parsed = customProviderInputSchema.safeParse(input)
    if (!parsed.success)
      throw new ProviderValidationError()

    const existing = this.#providers.findById(parsed.data.id)
    if (!existing && this.#modelRuntime.getProvider(parsed.data.id))
      throw new ProviderValidationError()
    const now = new Date().toISOString()
    const models = parsed.data.models.length > 0 ? parsed.data.models : existing?.models ?? []
    const record = this.#providers.upsert({
      id: parsed.data.id,
      displayName: parsed.data.displayName,
      description: parsed.data.description || null,
      api: parsed.data.api,
      baseUrl: parsed.data.baseUrl,
      models,
      credentialRef: parsed.data.id,
      enabled: parsed.data.enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    this.#ensureProviderState(record.id, parsed.data.enabled)
    this.#seedStoredCustomModels(record)
    this.#registerCustomProvider(record)
    const provider = (await this.listProviders()).find(provider => provider.id === record.id)
    if (!provider)
      throw new ProviderUnavailableError()
    return provider
  }

  #registerCustomProvider(record: ProviderConfigRecord): void {
    const input = toParsedCustomProvider(record)
    this.#modelRuntime.registerProvider(record.id, {
      api: input.api,
      baseUrl: input.baseUrl,
      models: input.models,
      name: input.displayName,
    })
  }

  #ensureProviderState(providerId: string, enabled: boolean): void {
    const current = this.#providers.findState(providerId)
    const now = new Date().toISOString()
    this.#providers.upsertState({
      createdAt: current?.createdAt ?? now,
      enabled: current?.enabled ?? enabled,
      providerId,
      updatedAt: now,
    })
  }

  #seedStoredCustomModels(provider: ProviderConfigRecord): void {
    const now = new Date().toISOString()
    for (const value of provider.models) {
      const model = customProviderModelSchema.parse(value)
      const current = this.#providers.findModelState(provider.id, model.id)
      if (current)
        continue
      this.#providers.upsertModelState({
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

  #reconcileRuntimeModels(providerId: string, source: 'builtin' | 'synced'): void {
    const now = new Date().toISOString()
    const runtimeModels = this.#modelRuntime.getModels(providerId)
    const seen = new Set(runtimeModels.map(model => model.id))
    for (const model of runtimeModels) {
      const current = this.#providers.findModelState(providerId, model.id)
      if (current?.source === 'manual')
        continue
      const sourceChanged = !current
        || current.sourceContextWindow !== model.contextWindow
        || current.sourceMaxTokens !== model.maxTokens
      this.#providers.upsertModelState({
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
        source,
        sourceContextWindow: model.contextWindow,
        sourceMaxTokens: model.maxTokens,
        sourceRevision: sourceChanged
          ? nextSourceRevision(current?.sourceRevision, now)
          : current.sourceRevision,
        updatedAt: now,
      })
    }
    for (const current of this.#providers.listModelStates(providerId)) {
      if (current.source === 'manual' || seen.has(current.modelId))
        continue
      this.#providers.upsertModelState({ ...current, available: false, updatedAt: now })
    }
  }

  #reconcileCustomSyncedModels(
    provider: ProviderConfigRecord,
    definitions: ReadonlyArray<{ id: string, name?: string }>,
  ): void {
    const now = new Date().toISOString()
    const seen = new Set(definitions.map(model => model.id))
    for (const definition of definitions) {
      const current = this.#providers.findModelState(provider.id, definition.id)
      if (current?.source === 'manual')
        continue
      this.#providers.upsertModelState({
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
    for (const current of this.#providers.listModelStates(provider.id)) {
      if (current.source !== 'synced' || seen.has(current.modelId))
        continue
      this.#providers.upsertModelState({ ...current, available: false, updatedAt: now })
    }
    this.#updateCustomProviderModels(provider)
  }

  #syncUnavailableReason(
    custom: ProviderConfigRecord | undefined,
    storedCredentialType: 'api_key' | 'oauth' | null,
  ): 'authentication_required' | 'unsupported_api' | null {
    if (!custom)
      return null
    if (!isCustomModelSyncSupported(custom.api))
      return 'unsupported_api'
    return storedCredentialType ? null : 'authentication_required'
  }

  #updateCustomProviderModels(provider: ProviderConfigRecord): void {
    const models = this.#providers.listModelStates(provider.id)
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
    const updated = this.#providers.upsert({ ...provider, models, updatedAt: new Date().toISOString() })
    this.#registerCustomProvider(updated)
  }

  #toBuddyModel(model: import('../storage/providerRepository').ProviderModelStateRecord): BuddyModel {
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
    const model = this.#providers.findModelState(providerId, modelId)
    if (!model)
      throw new ProviderUnavailableError()
    return model
  }

  async #requireListedProvider(providerId: string): Promise<BuddyProvider> {
    const provider = (await this.listProviders()).find(candidate => candidate.id === providerId)
    if (!provider)
      throw new ProviderUnavailableError()
    return provider
  }

  #activeRunsForProvider(providerId: string) {
    return this.#getActiveRuns().filter(run => run.provider === providerId)
  }

  #assertProviderIdle(providerId: string): void {
    if (this.#activeRunsForProvider(providerId).length > 0)
      throw new ProviderInUseError()
  }

  #assertModelIdle(providerId: string, modelId: string): void {
    if (this.#getActiveRuns().some(run => run.provider === providerId && run.model === modelId))
      throw new ProviderInUseError()
  }

  #clearDefaultForProvider(providerId: string): void {
    if (this.#providers.findDefaultModel()?.providerId === providerId)
      this.#providers.clearDefaultModel()
  }

  #clearDefaultIfMatches(providerId: string, modelId: string): void {
    const current = this.#providers.findDefaultModel()
    if (current?.providerId === providerId && current.modelId === modelId)
      this.#providers.clearDefaultModel()
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

export async function createProviderService(
  options: CreateProviderServiceOptions,
): Promise<ProviderService> {
  clearAmbientProviderCredentials(process.env)
  registerBunOAuthFlows()
  await mkdir(options.agentDirectory, { mode: 0o700, recursive: true })
  await chmod(options.agentDirectory, 0o700)
  const modelsPath = join(options.agentDirectory, 'models.json')
  await writeFile(modelsPath, '{}\n', { encoding: 'utf8', mode: 0o600 })
  await chmod(modelsPath, 0o600)
  const credentials = new HostCredentialStore(options.peer)
  const modelRuntime = await ModelRuntime.create({
    credentials,
    modelsPath,
    modelsStorePath: join(options.agentDirectory, 'models-store.json'),
    allowModelNetwork: true,
  })
  const authInteractions = new AuthInteractionService({
    notify: (method, params) => options.peer.notify(method, params),
    openExternal: async (url) => {
      await options.peer.request('host.openExternal', { url })
    },
  })
  const service = new ProviderService({
    authInteractions,
    getActiveRuns: options.getActiveRuns,
    modelRuntime,
    providers: options.providers ?? createProviderRepository(options.database),
    sessionRuntime: modelRuntime,
    syncCustomModels: input => syncOpenAiCompatibleModels(credentials, input),
  })
  await service.initializeProviders()
  return service
}

export class ProviderValidationError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy provider configuration is invalid')
    this.name = 'ProviderValidationError'
  }
}

export class ProviderUnavailableError extends Error {
  readonly code = 'PROVIDER_UNAVAILABLE'

  constructor() {
    super('Lexora Buddy provider is unavailable')
    this.name = 'ProviderUnavailableError'
  }
}

export class ProviderAuthenticationRequiredError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED'

  constructor() {
    super('Lexora Buddy provider authentication is required')
    this.name = 'ProviderAuthenticationRequiredError'
  }
}

export class ProviderInUseError extends Error {
  readonly code = 'PROVIDER_HAS_ACTIVE_RUNS'

  constructor() {
    super('Lexora Buddy provider has active runs')
    this.name = 'ProviderInUseError'
  }
}

export class ProviderModelSyncUnsupportedError extends Error {
  readonly code = 'MODEL_SYNC_UNSUPPORTED'

  constructor() {
    super('Lexora Buddy provider does not support model synchronization')
    this.name = 'ProviderModelSyncUnsupportedError'
  }
}

function isCustomModelSyncSupported(api: string): boolean {
  return api === 'openai-completions' || api === 'openai-responses'
}

async function syncOpenAiCompatibleModels(
  credentials: HostCredentialStore,
  input: { baseUrl: string, providerId: string },
): Promise<ReadonlyArray<{ id: string, name?: string }>> {
  const credential = await credentials.read(input.providerId)
  if (credential?.type !== 'api_key' || !credential.key)
    throw new ProviderAuthenticationRequiredError()
  const baseUrl = input.baseUrl.endsWith('/') ? input.baseUrl : `${input.baseUrl}/`
  let response: Response
  try {
    response = await fetch(new URL('models', baseUrl), {
      headers: { Authorization: `Bearer ${credential.key}` },
      signal: AbortSignal.timeout(15_000),
    })
  }
  catch {
    throw new ProviderModelSyncError()
  }
  if (!response.ok)
    throw new ProviderModelSyncError()
  const payload: unknown = await response.json()
  if (!isRecord(payload) || !Array.isArray(payload.data))
    throw new ProviderModelSyncError()
  return payload.data.map((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim())
      throw new ProviderModelSyncError()
    return {
      id: value.id.trim(),
      ...(typeof value.name === 'string' && value.name.trim()
        ? { name: value.name.trim() }
        : {}),
    }
  })
}

export class ProviderModelSyncError extends Error {
  readonly code = 'MODEL_SYNC_FAILED'

  constructor() {
    super('Lexora Buddy provider model synchronization failed')
    this.name = 'ProviderModelSyncError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
