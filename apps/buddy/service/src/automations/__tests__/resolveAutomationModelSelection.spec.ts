import type { Api, Model } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { ProviderUnavailableError } from '../../providers/ProviderFailure'
import { resolveAutomationModelSelection } from '../resolveAutomationModelSelection'

describe('resolveAutomationModelSelection', () => {
  it('collapses unavailable or incompatible automation models to no selection', async () => {
    await expect(resolveAutomationModelSelection({
      defaults: { getDefaultModel: () => Promise.resolve(null) },
      models: { resolveAvailable: () => Promise.resolve(model()) },
    }, { mode: 'default' })).resolves.toBeNull()

    await expect(resolveAutomationModelSelection({
      defaults: { getDefaultModel: () => Promise.resolve(null) },
      models: {
        resolveAvailable: () => Promise.reject(new ProviderUnavailableError()),
      },
    }, {
      mode: 'pinned',
      modelId: 'model-1',
      providerId: 'provider-1',
      reasoning: null,
    })).resolves.toBeNull()

    await expect(resolveAutomationModelSelection({
      defaults: { getDefaultModel: () => Promise.resolve(null) },
      models: { resolveAvailable: () => Promise.resolve(model()) },
    }, {
      mode: 'pinned',
      modelId: 'model-1',
      providerId: 'provider-1',
      reasoning: 'high',
    })).resolves.toBeNull()
  })
})

function model(): Model<Api> {
  return {
    api: 'openai-responses',
    baseUrl: 'https://models.example.test',
    contextWindow: 128_000,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: 'model-1',
    input: ['text'],
    maxTokens: 16_384,
    name: 'Model 1',
    provider: 'provider-1',
    reasoning: false,
  } as Model<Api>
}
