import { getSupportedThinkingLevels, InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import { openBuddyDatabase } from '../../storage/database'
import { createProviderRepository } from '../../storage/providerRepository'
import { AuthInteractionService } from '../AuthInteractionService'
import { readModelCapabilities } from '../modelCapabilities'
import { createProviderCredentialStatus } from '../ProviderCredentialStatus'
import { ProviderService } from '../ProviderService'

describe('provider model resolution', () => {
  it('uses the current connection for list and execution while retaining imported model edits across restart', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    const credentials = new InMemoryCredentialStore()
    const providers = createProviderRepository(database)
    const setup = async () => {
      const runtime = await ModelRuntime.create({ credentials, modelsPath: null, modelsStore: new InMemoryModelsStore(), refreshOnCreate: false })
      const service = new ProviderService({
        authInteractions: new AuthInteractionService({ notify: () => {} }),
        credentialStatus: createProviderCredentialStatus(credentials),
        modelDiscovery: { supports: () => false, discover: async () => [] },
        modelRuntime: runtime,
        providers,
      })
      await service.initializeProviders()
      return { service, runtime }
    }
    try {
      const { service } = await setup()
      const connection = { id: 'fixture-relay', displayName: 'Fixture relay', baseUrl: 'https://relay.example.test/v1' }
      await service.upsertCustomProvider({
        ...connection,
        api: 'openai-completions',
        models: [{ id: 'manual-model', name: 'Imported model' }],
      })
      await service.upsertManualModel(connection.id, { id: 'manual-model', name: 'Edited model', contextWindow: 64_000, maxTokens: 8000 })
      await service.setModelParametersOverride(connection.id, 'manual-model', { contextWindow: 32_000, maxTokens: 4000 })
      const capabilities = { image: true, audio: true, video: true, reasoningOptions: ['off', 'high'] as Array<'off' | 'high'> }
      await service.setModelCapabilities(connection.id, 'manual-model', capabilities)
      expect((await service.listModels(connection.id))[0]).toMatchObject({ api: 'openai-completions', capabilities: ['text', 'image', 'audio', 'reasoning'] })

      await service.upsertCustomProvider({ ...connection, api: 'anthropic-messages', baseUrl: 'https://updated.example.test', models: [] })
      const verify = async (service: ProviderService) => {
        const listed = (await service.listModels(connection.id))[0]!
        const resolved = service.executionModels.resolve({ providerId: connection.id, modelId: 'manual-model', contextWindow: null, maxTokens: null })
        expect(listed).toMatchObject({
          api: 'anthropic-messages',
          capabilities: ['text', 'image', 'reasoning'],
          capabilityOverrides: capabilities,
          displayName: 'Edited model',
          contextWindow: 32_000,
          maxTokens: 4000,
          sourceContextWindow: 64_000,
          sourceMaxTokens: 8000,
        })
        expect(resolved).toMatchObject({ api: listed.api, name: listed.displayName, baseUrl: 'https://updated.example.test', contextWindow: listed.contextWindow, maxTokens: listed.maxTokens })
        expect(readModelCapabilities(resolved)).toMatchObject({ image: true, audio: false, video: false })
        expect(getSupportedThinkingLevels(resolved)).toEqual(listed.reasoningOptions)
      }
      await verify(service)
      const restored = await setup()
      await verify(restored.service)
      expect(restored.runtime.getModels(connection.id)).toMatchObject([{ id: 'manual-model', name: 'Edited model', api: 'anthropic-messages', contextWindow: 64_000 }])
    }
    finally {
      database.close()
    }
  })
})
