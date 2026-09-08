import { describe, expect, it, vi } from 'vitest'
import { OpenAiCompatibleModelDiscovery } from '../ProviderModelDiscovery'

describe('providerModelDiscovery', () => {
  it('discovers and normalizes models through the OpenAI-compatible protocol', async () => {
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      data: [
        { id: ' model-1 ', name: ' Model One ' },
        { id: 'model-2' },
      ],
    }), { status: 200 }))
    const discovery = new OpenAiCompatibleModelDiscovery({
      credentials: {
        read: () => Promise.resolve({ key: 'test-api-key', type: 'api_key' }),
      },
      request: request as typeof fetch,
    })

    expect(discovery.supports('openai-completions')).toBe(true)
    expect(discovery.supports('openai-responses')).toBe(true)
    expect(discovery.supports('anthropic-messages')).toBe(false)
    await expect(discovery.discover({
      api: 'openai-responses',
      baseUrl: 'https://models.example.test/v1',
      providerId: 'example',
    })).resolves.toEqual([
      { id: 'model-1', name: 'Model One' },
      { id: 'model-2' },
    ])
    expect(request).toHaveBeenCalledOnce()
    const [url, init] = request.mock.calls[0]!
    expect(String(url)).toBe('https://models.example.test/v1/models')
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-api-key' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('requires a local API key before model discovery', async () => {
    const request = vi.fn()
    const discovery = new OpenAiCompatibleModelDiscovery({
      credentials: { read: () => Promise.resolve(undefined) },
      request: request as typeof fetch,
    })

    await expect(discovery.discover({
      api: 'openai-responses',
      baseUrl: 'https://models.example.test/v1',
      providerId: 'example',
    })).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
    expect(request).not.toHaveBeenCalled()
  })
})
