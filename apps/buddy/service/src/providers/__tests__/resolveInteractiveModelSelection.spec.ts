import type { Api, Model } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { ProviderUnavailableError } from '../ProviderFailure'
import { resolveInteractiveModelSelection } from '../resolveInteractiveModelSelection'

describe('resolveInteractiveModelSelection', () => {
  it('keeps missing defaults, unavailable models, and unsupported service tiers distinct', async () => {
    await expect(resolveInteractiveModelSelection({
      executionModels: { resolveAvailable: () => Promise.resolve(model()) },
      getDefaultModel: () => Promise.resolve(null),
    }, null)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })

    await expect(resolveInteractiveModelSelection({
      executionModels: {
        resolveAvailable: () => Promise.reject(new ProviderUnavailableError()),
      },
      getDefaultModel: () => Promise.resolve(null),
    }, {
      modelId: 'model-1',
      providerId: 'provider-1',
      reasoning: null,
      serviceTier: null,
    })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })

    await expect(resolveInteractiveModelSelection({
      executionModels: { resolveAvailable: () => Promise.resolve(model()) },
      getDefaultModel: () => Promise.resolve(null),
    }, {
      modelId: 'model-1',
      providerId: 'provider-1',
      reasoning: null,
      serviceTier: 'priority',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
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
