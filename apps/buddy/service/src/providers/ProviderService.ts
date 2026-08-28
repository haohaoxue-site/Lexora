import type {
  AuthType,
  Provider,
} from '@earendil-works/pi-ai'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { DefaultModelRepository } from '../storage/defaultModelRepository'
import type {
  ProviderConfigRecord,
  ProviderConfigRepository,
} from '../storage/providerConfigRepository'
import type { ProviderRepository } from '../storage/providerRepository'
import type { ProviderStateRepository } from '../storage/providerStateRepository'
import type { AuthInteractionService } from './AuthInteractionService'
import type { ProviderCredentialStatus } from './ProviderCredentialStatus'
import type {
  ProviderModelCatalogRuntime,
} from './ProviderModelCatalog'
import type { ProviderModelDiscovery } from './ProviderModelDiscovery'
import type {
  BuddyDefaultModel,
  BuddyModel,
  BuddyProvider,
  CustomProviderInput,
  ModelParametersOverride,
  ProviderModelInput,
} from './providerSchemas'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { ProviderExecutionModelResolver } from './ProviderExecutionModelResolver'
import {
  ProviderAuthenticationRequiredError,
  ProviderInUseError,
  ProviderModelSyncUnsupportedError,
  ProviderUnavailableError,
  ProviderValidationError,
} from './ProviderFailure'
import { ProviderModelCatalog } from './ProviderModelCatalog'
import {
  buddyProviderSchema,
  customProviderInputSchema,
  defaultModelSchema,
} from './providerSchemas'

export interface ProviderModelRuntime extends ProviderModelCatalogRuntime {
  getProvider: (providerId: string) => Provider | undefined
  getProviders: () => readonly Provider[]
  login: ModelRuntime['login']
  logout: ModelRuntime['logout']
  unregisterProvider: (providerId: string) => void
}

export interface ProviderServiceOptions {
  authInteractions: AuthInteractionService
  credentialStatus: ProviderCredentialStatus
  getActiveRuns?: () => ReadonlyArray<{ model: string, provider: string }>
  modelDiscovery: ProviderModelDiscovery
  modelRuntime: ProviderModelRuntime
  providers: ProviderRepository
  sessionRuntime?: ModelRuntime
}

export class ProviderService {
  readonly #authInteractions: AuthInteractionService
  readonly #configs: ProviderConfigRepository
  readonly #credentialStatus: ProviderCredentialStatus
  readonly #defaultModel: DefaultModelRepository
  readonly #getActiveRuns: () => ReadonlyArray<{ model: string, provider: string }>
  readonly #modelDiscovery: ProviderModelDiscovery
  readonly #modelRuntime: ProviderModelRuntime
  readonly #modelCatalog: ProviderModelCatalog
  readonly #states: ProviderStateRepository
  readonly executionModels: ProviderExecutionModelResolver

  constructor(options: ProviderServiceOptions) {
    this.#authInteractions = options.authInteractions
    this.#configs = options.providers.configs
    this.#credentialStatus = options.credentialStatus
    this.#defaultModel = options.providers.defaultModel
    this.#getActiveRuns = options.getActiveRuns ?? (() => [])
    this.#modelDiscovery = options.modelDiscovery
    this.#modelRuntime = options.modelRuntime
    this.#modelCatalog = new ProviderModelCatalog({
      configs: options.providers.configs,
      modelRuntime: options.modelRuntime,
      models: options.providers.models,
    })
    this.#states = options.providers.states
    this.executionModels = new ProviderExecutionModelResolver({
      credentialStatus: options.credentialStatus,
      modelCatalog: this.#modelCatalog,
      sessionRuntime: options.sessionRuntime,
      states: options.providers.states,
    })
  }

  async initializeProviders(): Promise<void> {
    const customProviderIds = new Set<string>()
    for (const provider of this.#configs.list()) {
      customProviderIds.add(provider.id)
      this.#ensureProviderState(provider.id, provider.enabled)
      this.#modelCatalog.seedStoredCustomModels(provider)
      this.#modelCatalog.registerCustomProvider(provider)
    }
    const credentialProviderIds = new Set((await this.#credentialStatus.listOrEmpty())
      .map(credential => credential.providerId))
    for (const provider of this.#modelRuntime.getProviders()) {
      if (customProviderIds.has(provider.id)
        || (!this.#states.findByProviderId(provider.id) && !credentialProviderIds.has(provider.id))) {
        continue
      }
      this.#ensureProviderState(provider.id, false)
      this.#modelCatalog.reconcileBuiltinModels(provider.id)
    }
  }

  async listProviders(): Promise<readonly BuddyProvider[]> {
    const credentialList = await this.#credentialStatus.listOrEmpty()
    const credentials = new Map(credentialList
      .map(credential => [credential.providerId, credential.type]))
    const customProviders = new Map(this.#configs.list().map(provider => [provider.id, provider]))
    const providerStates = new Map(this.#states.list().map(state => [state.providerId, state]))
    const modelSummaries = this.#modelCatalog.summarize()
    const providers = this.#modelRuntime.getProviders().map((provider) => {
      const custom = customProviders.get(provider.id)
      const state = providerStates.get(provider.id)
      const storedCredentialType = credentials.get(provider.id) ?? null
      const modelSummary = modelSummaries.get(provider.id)
      const added = Boolean(state || custom || storedCredentialType)
      const enabled = state?.enabled ?? custom?.enabled ?? Boolean(storedCredentialType)
      const enabledModelCount = modelSummary?.enabledModelCount ?? 0
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
        modelCount: modelSummary?.modelCount ?? 0,
        setupComplete: storedCredentialType !== null && enabledModelCount > 0,
        syncUnavailableReason,
      })
    })
    const registered = new Set(providers.map(provider => provider.id))
    for (const custom of customProviders.values()) {
      if (registered.has(custom.id))
        continue
      const modelSummary = modelSummaries.get(custom.id)
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
        enabledModelCount: modelSummary?.enabledModelCount ?? 0,
        modelCount: modelSummary?.modelCount ?? 0,
        setupComplete: false,
        syncUnavailableReason: 'unsupported_api',
      }))
    }
    return providers.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  async listModels(providerId?: string): Promise<readonly BuddyModel[]> {
    return this.#modelCatalog.list(providerId)
  }

  async addProvider(providerId: string): Promise<BuddyProvider> {
    if (!this.#modelRuntime.getProvider(providerId))
      throw new ProviderUnavailableError()
    this.#ensureProviderState(providerId, false)
    this.#modelCatalog.reconcileBuiltinModels(providerId)
    return this.#requireListedProvider(providerId)
  }

  async upsertManualModel(providerId: string, input: ProviderModelInput): Promise<BuddyModel> {
    const custom = this.#configs.findById(providerId)
    if (!custom)
      throw new ProviderValidationError()
    this.#assertProviderIdle(providerId)
    return this.#modelCatalog.upsertManualModel(custom, input)
  }

  async setModelParametersOverride(
    providerId: string,
    modelId: string,
    input: ModelParametersOverride,
  ): Promise<BuddyModel> {
    return this.#modelCatalog.setParametersOverride(providerId, modelId, input)
  }

  async acknowledgeModelSourceUpdate(providerId: string, modelId: string): Promise<BuddyModel> {
    return this.#modelCatalog.acknowledgeSourceUpdate(providerId, modelId)
  }

  async restoreModelSourceParameters(providerId: string, modelId: string): Promise<BuddyModel> {
    return this.#modelCatalog.restoreSourceParameters(providerId, modelId)
  }

  async setModelEnabled(providerId: string, modelId: string, enabled: boolean): Promise<BuddyModel> {
    this.#modelCatalog.assertCanSetEnabled(providerId, modelId, enabled)
    if (!enabled)
      this.#assertModelIdle(providerId, modelId)
    const next = this.#modelCatalog.setEnabled(providerId, modelId, enabled)
    if (!enabled)
      this.#clearDefaultIfMatches(providerId, modelId)
    return next
  }

  async setProviderEnabled(providerId: string, enabled: boolean): Promise<BuddyProvider> {
    const current = this.#states.findByProviderId(providerId)
    if (!current)
      throw new ProviderUnavailableError()
    if (!enabled)
      this.#assertProviderIdle(providerId)
    if (enabled) {
      const credentials = await this.#credentialStatus.list()
      if (!credentials.some(credential => credential.providerId === providerId))
        throw new ProviderAuthenticationRequiredError()
      if (!this.#modelCatalog.hasEnabledAvailableModel(providerId))
        throw new ProviderUnavailableError()
    }
    this.#states.upsert({
      ...current,
      enabled,
      updatedAt: new Date().toISOString(),
    })
    if (!enabled)
      this.#clearDefaultForProvider(providerId)
    return this.#requireListedProvider(providerId)
  }

  getDefaultModel(): Promise<BuddyDefaultModel | null> {
    const current = this.#defaultModel.find()
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
      this.#defaultModel.clear()
      return null
    }
    const parsed = defaultModelSchema.parse(value)
    const resolvedModel = await this.executionModels.resolveAvailable({
      contextWindow: null,
      maxTokens: null,
      modelId: parsed.modelId,
      providerId: parsed.providerId,
    })
    if (
      parsed.reasoning !== null
      && !getSupportedThinkingLevels(resolvedModel).includes(parsed.reasoning)
    ) {
      throw new ProviderValidationError()
    }
    const stored = this.#defaultModel.set({ ...parsed, updatedAt: new Date().toISOString() })
    return defaultModelSchema.parse({
      modelId: stored.modelId,
      providerId: stored.providerId,
      reasoning: stored.reasoning,
    })
  }

  async syncModels(providerId: string): Promise<readonly BuddyModel[]> {
    if (!this.#states.findByProviderId(providerId))
      throw new ProviderUnavailableError()
    const custom = this.#configs.findById(providerId)
    if (!custom || !this.#modelDiscovery.supports(custom.api))
      throw new ProviderModelSyncUnsupportedError()
    this.#assertProviderIdle(providerId)
    const definitions = await this.#modelDiscovery.discover({
      api: custom.api,
      baseUrl: custom.baseUrl,
      providerId,
    })
    this.#modelCatalog.reconcileSyncedModels(custom, definitions)
    return this.listModels(providerId)
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

  async logout(providerId: string): Promise<void> {
    this.#assertProviderIdle(providerId)
    await this.#modelRuntime.logout(providerId)
  }

  async clearCredential(providerId: string): Promise<void> {
    this.#assertProviderIdle(providerId)
    await this.#modelRuntime.logout(providerId)
  }

  async removeProvider(providerId: string): Promise<void> {
    this.#assertProviderIdle(providerId)
    await this.#modelRuntime.logout(providerId)
    this.#clearDefaultForProvider(providerId)
    this.#modelCatalog.removeForProvider(providerId)
    this.#states.remove(providerId)
    if (this.#configs.findById(providerId)) {
      this.#configs.remove(providerId)
      this.#modelRuntime.unregisterProvider(providerId)
    }
  }

  async upsertCustomProvider(input: CustomProviderInput): Promise<BuddyProvider> {
    const parsed = customProviderInputSchema.safeParse(input)
    if (!parsed.success)
      throw new ProviderValidationError()

    const existing = this.#configs.findById(parsed.data.id)
    if (!existing && this.#modelRuntime.getProvider(parsed.data.id))
      throw new ProviderValidationError()
    if (existing)
      this.#assertProviderIdle(parsed.data.id)
    const now = new Date().toISOString()
    const models = parsed.data.models.length > 0 ? parsed.data.models : existing?.models ?? []
    const record = this.#configs.upsert({
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
    this.#modelCatalog.seedStoredCustomModels(record)
    this.#modelCatalog.registerCustomProvider(record)
    const provider = (await this.listProviders()).find(provider => provider.id === record.id)
    if (!provider)
      throw new ProviderUnavailableError()
    return provider
  }

  #ensureProviderState(providerId: string, enabled: boolean): void {
    const current = this.#states.findByProviderId(providerId)
    const now = new Date().toISOString()
    this.#states.upsert({
      createdAt: current?.createdAt ?? now,
      enabled: current?.enabled ?? enabled,
      providerId,
      updatedAt: now,
    })
  }

  #syncUnavailableReason(
    custom: ProviderConfigRecord | undefined,
    storedCredentialType: 'api_key' | 'oauth' | null,
  ): 'authentication_required' | 'unsupported_api' | null {
    if (!custom)
      return null
    if (!this.#modelDiscovery.supports(custom.api))
      return 'unsupported_api'
    return storedCredentialType ? null : 'authentication_required'
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
    if (this.#defaultModel.find()?.providerId === providerId)
      this.#defaultModel.clear()
  }

  #clearDefaultIfMatches(providerId: string, modelId: string): void {
    const current = this.#defaultModel.find()
    if (current?.providerId === providerId && current.modelId === modelId)
      this.#defaultModel.clear()
  }
}

export type { ProviderFailureCode } from './ProviderFailure'
export {
  ProviderAuthenticationRequiredError,
  ProviderFailure,
  ProviderInUseError,
  ProviderModelSyncError,
  ProviderModelSyncUnsupportedError,
  ProviderUnavailableError,
  ProviderValidationError,
} from './ProviderFailure'
