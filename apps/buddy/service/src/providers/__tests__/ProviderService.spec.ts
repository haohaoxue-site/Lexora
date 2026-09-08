import type {
  Api,
  AuthInteraction,
  AuthType,
  Credential,
  CredentialInfo,
  Model,
  Provider,
} from '@earendil-works/pi-ai'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ProviderModelDiscovery } from '../ProviderModelDiscovery'
import type { ProviderServiceOptions } from '../ProviderService'
import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { openBuddyDatabase } from '../../storage/database'
import { createProviderRepository } from '../../storage/providerRepository'
import { AuthInteractionService } from '../AuthInteractionService'
import { HostCredentialStoreError } from '../HostCredentialStore'
import { createProviderCredentialStatus } from '../ProviderCredentialStatus'
import { ProviderService } from '../ProviderService'

const databasePaths: string[] = []

afterEach(async () => {
  await Promise.all(databasePaths.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('providerService', () => {
  it('registers custom provider metadata without accepting secrets', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-provider-'))
    databasePaths.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const database = openBuddyDatabase({ databasePath })
    const runtime = new FakeModelRuntime()
    runtime.credentials = [{ providerId: 'openai-proxy', type: 'api_key' } as CredentialInfo]
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      modelRuntime: runtime,
      providers: createProviderRepository(database),
    })

    await service.upsertCustomProvider({
      api: 'openai-responses',
      baseUrl: 'https://models.example.test/v1',
      displayName: 'Example Models',
      enabled: true,
      id: 'example-models',
      models: [{
        contextWindow: 128_000,
        id: 'reasoner',
        input: ['text'],
        maxTokens: 16_384,
        name: 'Reasoner',
        reasoning: true,
      }],
    })

    expect(runtime.registered).toEqual([{
      config: expect.objectContaining({
        api: 'openai-responses',
        baseUrl: 'https://models.example.test/v1',
        name: 'Example Models',
      }),
      providerId: 'example-models',
    }])
    const persisted = await readFile(databasePath)
    expect(persisted.includes(Buffer.from('sk-test-secret'))).toBe(false)

    await expect(service.upsertCustomProvider({
      api: 'openai-responses',
      apiKey: 'sk-test-secret',
      baseUrl: 'https://models.example.test/v1',
      displayName: 'Unsafe',
      id: 'unsafe',
      models: [],
    } as never)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.upsertCustomProvider({
      api: 'openai-responses',
      baseUrl: 'http://models.example.test/v1',
      displayName: 'Insecure remote',
      enabled: true,
      id: 'insecure-remote',
      models: [{
        contextWindow: 4096,
        id: 'model-1',
        input: ['text'],
        maxTokens: 1024,
        name: 'Model',
        reasoning: false,
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    database.close()
  })

  it('requires a currently authenticated and available provider before resolving a run model', async () => {
    const runtime = new FakeModelRuntime()
    runtime.providers = [{
      auth: { apiKey: {} },
      baseUrl: 'https://api.anthropic.com',
      id: 'anthropic',
      name: 'Anthropic',
    } as Provider]
    runtime.models = [model('anthropic', 'model-1')]
    const sessionRuntime = {} as ModelRuntime
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      modelRuntime: runtime,
      providers: createProviderRepository(database),
      sessionRuntime,
    })

    await service.addProvider('anthropic')
    await service.setModelEnabled('anthropic', 'model-1', true)
    const selection = {
      contextWindow: null,
      maxTokens: null,
      modelId: 'model-1',
      providerId: 'anthropic',
    }
    await expect(service.executionModels.resolveAvailable(selection)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    runtime.credentials = [{ providerId: 'anthropic', type: 'api_key' } as CredentialInfo]
    await service.setProviderEnabled('anthropic', true)
    await expect(service.executionModels.resolveAvailable(selection)).resolves.toBe(runtime.models[0])
    await expect(service.executionModels.resolveSession(selection)).resolves.toEqual({
      model: runtime.models[0],
      runtime: sessionRuntime,
    })
    runtime.credentials = []
    await expect(service.executionModels.resolveAvailable(selection)).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    })
    runtime.credentialsError = new HostCredentialStoreError('CREDENTIAL_STORE_UNAVAILABLE')
    await expect(service.executionModels.resolveAvailable(selection)).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    })
    await expect(service.listProviders()).resolves.toEqual([
      expect.objectContaining({ id: 'anthropic', status: 'authentication_required' }),
    ])
    runtime.credentialsError = null
    runtime.credentials = [{ providerId: 'anthropic', type: 'api_key' } as CredentialInfo]
    await expect(service.executionModels.resolveAvailable({
      ...selection,
      contextWindow: 64_000,
      maxTokens: 8_000,
    })).resolves.toMatchObject({ contextWindow: 64_000, maxTokens: 8_000 })
    await expect(service.executionModels.resolveAvailable({
      ...selection,
      contextWindow: 64_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.executionModels.resolveAvailable({
      ...selection,
      providerId: 'missing',
    })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    database.close()
  })

  it('keeps source parameters, user overrides, and source-update acknowledgement separate', async () => {
    const runtime = new FakeModelRuntime()
    runtime.providers = [provider('anthropic')]
    runtime.models = [model('anthropic', 'claude')]
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      modelRuntime: runtime,
      providers: createProviderRepository(database),
    })

    await service.addProvider('anthropic')
    await expect(service.setModelParametersOverride('anthropic', 'claude', {
      contextWindow: 8_000,
      maxTokens: 16_000,
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(await service.listModels('anthropic')).toEqual([
      expect.objectContaining({ hasParameterOverride: false }),
    ])
    await service.setModelParametersOverride('anthropic', 'claude', {
      contextWindow: 200_000,
      maxTokens: 32_000,
    })
    expect(await service.listModels('anthropic')).toEqual([
      expect.objectContaining({
        contextWindow: 200_000,
        hasParameterOverride: true,
        maxTokens: 32_000,
        sourceContextWindow: 128_000,
        sourceMaxTokens: 16_384,
        sourceParametersUpdated: false,
      }),
    ])
    expect(service.executionModels.resolve({
      contextWindow: null,
      maxTokens: null,
      modelId: 'claude',
      providerId: 'anthropic',
    })).toMatchObject({
      contextWindow: 200_000,
      maxTokens: 32_000,
    })

    runtime.models = [{
      ...runtime.models[0]!,
      contextWindow: 256_000,
      maxTokens: 64_000,
    }]
    await service.initializeProviders()
    expect(await service.listModels('anthropic')).toEqual([
      expect.objectContaining({
        contextWindow: 200_000,
        maxTokens: 32_000,
        sourceContextWindow: 256_000,
        sourceMaxTokens: 64_000,
        sourceParametersUpdated: true,
      }),
    ])

    await service.acknowledgeModelSourceUpdate('anthropic', 'claude')
    expect(await service.listModels('anthropic')).toEqual([
      expect.objectContaining({
        contextWindow: 200_000,
        hasParameterOverride: true,
        sourceParametersUpdated: false,
      }),
    ])

    await service.restoreModelSourceParameters('anthropic', 'claude')
    expect(await service.listModels('anthropic')).toEqual([
      expect.objectContaining({
        contextWindow: 256_000,
        hasParameterOverride: false,
        maxTokens: 64_000,
        sourceParametersUpdated: false,
      }),
    ])
    database.close()
  })

  it('separates disabling, clearing local authentication, and removing a provider while protecting active runs', async () => {
    const runtime = new FakeModelRuntime()
    runtime.providers = [provider('anthropic')]
    runtime.models = [model('anthropic', 'claude')]
    runtime.credentials = [{ providerId: 'anthropic', type: 'api_key' } as CredentialInfo]
    let activeRuns: Array<{ model: string, provider: string }> = [{
      model: 'claude',
      provider: 'anthropic',
    }]
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      getActiveRuns: () => activeRuns,
      modelRuntime: runtime,
      providers: createProviderRepository(database),
    })
    await service.addProvider('anthropic')
    await service.setModelEnabled('anthropic', 'claude', true)
    await service.setProviderEnabled('anthropic', true)

    await expect(service.setProviderEnabled('anthropic', false)).rejects.toMatchObject({
      code: 'PROVIDER_HAS_ACTIVE_RUNS',
    })
    await expect(service.setModelEnabled('anthropic', 'claude', false)).rejects.toMatchObject({
      code: 'PROVIDER_HAS_ACTIVE_RUNS',
    })
    await expect(service.logout('anthropic')).rejects.toMatchObject({
      code: 'PROVIDER_HAS_ACTIVE_RUNS',
    })
    await expect(service.clearCredential('anthropic')).rejects.toMatchObject({
      code: 'PROVIDER_HAS_ACTIVE_RUNS',
    })
    await expect(service.removeProvider('anthropic')).rejects.toMatchObject({
      code: 'PROVIDER_HAS_ACTIVE_RUNS',
    })
    expect(runtime.credentials).toHaveLength(1)

    activeRuns = []
    await service.clearCredential('anthropic')
    expect(runtime.credentials).toEqual([])
    expect(await service.listProviders()).toEqual([
      expect.objectContaining({ added: true, setupComplete: false }),
    ])
    await service.removeProvider('anthropic')
    expect(await service.listProviders()).toEqual([
      expect.objectContaining({ added: false, enabled: false }),
    ])
    database.close()
  })

  it('does not re-register or refresh an existing custom provider while one of its runs is active', async () => {
    const runtime = new FakeModelRuntime()
    let activeRuns: Array<{ model: string, provider: string }> = []
    let syncCalls = 0
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      getActiveRuns: () => activeRuns,
      modelRuntime: runtime,
      providers: createProviderRepository(database),
      modelDiscovery: createTestModelDiscovery(async () => {
        syncCalls += 1
        return []
      }),
    })
    await service.upsertCustomProvider({
      api: 'openai-responses',
      baseUrl: 'https://old.example.test/v1',
      displayName: 'Custom provider',
      enabled: false,
      id: 'custom-provider',
      models: [],
    })
    activeRuns = [{ model: 'model-1', provider: 'custom-provider' }]

    await expect(service.upsertCustomProvider({
      api: 'openai-completions',
      baseUrl: 'https://new.example.test/v1',
      displayName: 'Changed provider',
      enabled: false,
      id: 'custom-provider',
      models: [],
    })).rejects.toMatchObject({ code: 'PROVIDER_HAS_ACTIVE_RUNS' })
    await expect(service.upsertManualModel('custom-provider', {
      id: 'manual-model',
      input: ['text'],
      reasoning: false,
    })).rejects.toMatchObject({ code: 'PROVIDER_HAS_ACTIVE_RUNS' })
    await expect(service.syncModels('custom-provider'))
      .rejects
      .toMatchObject({ code: 'PROVIDER_HAS_ACTIVE_RUNS' })
    expect(runtime.registered).toHaveLength(1)
    expect(syncCalls).toBe(0)
    await expect(service.listProviders()).resolves.toEqual([
      expect.objectContaining({
        api: 'openai-responses',
        baseUrl: 'https://old.example.test/v1',
      }),
    ])

    activeRuns = []
    await expect(service.upsertCustomProvider({
      api: 'openai-completions',
      baseUrl: 'https://new.example.test/v1',
      displayName: 'Changed provider',
      enabled: false,
      id: 'custom-provider',
      models: [],
    })).resolves.toMatchObject({
      api: 'openai-completions',
      baseUrl: 'https://new.example.test/v1',
    })
    expect(runtime.registered).toHaveLength(2)
    database.close()
  })

  it('syncs supported custom model catalogs while preserving manual overrides and explains unsupported APIs', async () => {
    const runtime = new FakeModelRuntime()
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const service = createProviderServiceForTest({
      authInteractions: new AuthInteractionService({ notify: () => {} }),
      modelRuntime: runtime,
      providers: createProviderRepository(database),
      modelDiscovery: createTestModelDiscovery(async ({ providerId }) => providerId === 'openai-proxy'
        ? [{ id: 'manual-model', name: 'Remote name' }, { id: 'remote-model' }]
        : []),
    })
    await service.upsertCustomProvider({
      api: 'openai-responses',
      baseUrl: 'https://openai.example.test/v1',
      displayName: 'OpenAI Proxy',
      enabled: false,
      id: 'openai-proxy',
      models: [],
    })
    await service.upsertManualModel('openai-proxy', {
      id: 'manual-model',
      input: ['text'],
      name: 'Manual name',
      reasoning: false,
    })
    await service.setModelEnabled('openai-proxy', 'manual-model', false)
    await service.upsertManualModel('openai-proxy', {
      id: 'manual-model',
      input: ['text'],
      name: 'Updated manual name',
      reasoning: false,
    })
    expect(await service.listModels('openai-proxy')).toContainEqual(expect.objectContaining({
      displayName: 'Updated manual name',
      enabled: false,
      id: 'manual-model',
    }))
    await service.setModelEnabled('openai-proxy', 'manual-model', true)
    await service.syncModels('openai-proxy')
    expect(await service.listModels('openai-proxy')).toEqual([
      expect.objectContaining({ displayName: 'Updated manual name', enabled: true, source: 'manual' }),
      expect.objectContaining({ id: 'remote-model', enabled: false, source: 'synced' }),
    ])

    await service.upsertCustomProvider({
      api: 'anthropic-messages',
      baseUrl: 'https://anthropic.example.test',
      displayName: 'Anthropic Proxy',
      enabled: false,
      id: 'anthropic-proxy',
      models: [],
    })
    expect(await service.listProviders()).toContainEqual(expect.objectContaining({
      canSyncModels: false,
      id: 'anthropic-proxy',
      syncUnavailableReason: 'unsupported_api',
    }))
    await expect(service.syncModels('anthropic-proxy')).rejects.toMatchObject({
      code: 'MODEL_SYNC_UNSUPPORTED',
    })
    database.close()
  })
})

type ProviderServiceTestOptions
  = Omit<ProviderServiceOptions, 'credentialStatus' | 'modelDiscovery' | 'modelRuntime'>
    & {
      modelDiscovery?: ProviderModelDiscovery
      modelRuntime: FakeModelRuntime
    }

function createProviderServiceForTest(options: ProviderServiceTestOptions): ProviderService {
  const {
    modelDiscovery = createTestModelDiscovery(),
    modelRuntime,
    ...serviceOptions
  } = options
  return new ProviderService({
    ...serviceOptions,
    credentialStatus: createProviderCredentialStatus({
      list: () => modelRuntime.listCredentials(),
    }),
    modelDiscovery,
    modelRuntime,
  })
}

function createTestModelDiscovery(
  discover: ProviderModelDiscovery['discover'] = () => Promise.resolve([]),
): ProviderModelDiscovery {
  return {
    discover,
    supports: api => api === 'openai-completions' || api === 'openai-responses',
  }
}

function provider(id: string): Provider {
  return {
    auth: { apiKey: {} },
    baseUrl: `https://api.${id}.test`,
    id,
    name: id,
  } as Provider
}

function model(providerId: string, id: string): Model<Api> {
  return {
    api: 'openai-responses',
    baseUrl: `https://api.${providerId}.test`,
    contextWindow: 128_000,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id,
    input: ['text'],
    maxTokens: 16_384,
    name: id,
    provider: providerId,
    reasoning: false,
  } as Model<Api>
}

class FakeModelRuntime {
  readonly registered: Array<{ config: unknown, providerId: string }> = []
  credentialsError: Error | null = null
  credentials: CredentialInfo[] = []
  loginResult: string | null = null
  providers: Provider[] = []
  models: Model<Api>[] = []

  getAuth(): Promise<undefined> {
    return Promise.resolve(undefined)
  }

  getModels(providerId?: string): readonly Model<Api>[] {
    return providerId ? this.models.filter(model => model.provider === providerId) : this.models
  }

  getProvider(providerId: string): Provider | undefined {
    if (providerId === 'openai-codex')
      return { auth: { oauth: {} }, id: providerId } as Provider
    return this.providers.find(provider => provider.id === providerId)
  }

  getProviders(): readonly Provider[] {
    return this.providers
  }

  listCredentials(): Promise<readonly CredentialInfo[]> {
    if (this.credentialsError)
      return Promise.reject(this.credentialsError)
    return Promise.resolve(this.credentials)
  }

  async login(_providerId: string, _type: AuthType, interaction: AuthInteraction): Promise<Credential> {
    interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/authorize' })
    this.loginResult = await interaction.prompt({
      message: 'Paste the authorization code',
      type: 'manual_code',
    })
    return { type: 'api_key', key: this.loginResult }
  }

  logout(providerId: string): Promise<void> {
    this.credentials = this.credentials.filter(credential => credential.providerId !== providerId)
    return Promise.resolve()
  }

  registerProvider(providerId: string, config: unknown): void {
    this.registered.push({ config, providerId })
  }

  unregisterProvider(): void {}
}
