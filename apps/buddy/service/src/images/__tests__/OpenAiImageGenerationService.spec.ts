import type { Model } from '@earendil-works/pi-ai'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

import {
  OpenAiImageGenerationService,
  supportsOpenAiImageGeneration,
} from '../OpenAiImageGenerationService'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

describe('openAiImageGenerationService', () => {
  it('uses the OpenAI Responses image generation tool with attachment bytes', async () => {
    const getAuth = vi.fn(async () => ({
      auth: { apiKey: 'private-api-key' },
      source: 'API key',
    }))
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      id: 'response-1',
      output: [{
        id: 'image-call-1',
        result: png.toString('base64'),
        status: 'completed',
        type: 'image_generation_call',
      }],
      status: 'completed',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))
    const service = new OpenAiImageGenerationService({
      fetch: request,
      modelRuntime: {
        getAuth,
      },
    })
    const model = openAiModel()
    const signal = new AbortController().signal

    await expect(service.generate({
      inputImages: [{ data: png.toString('base64'), mimeType: 'image/png', type: 'image' }],
      model,
      prompt: 'Create a Q-style pixel-art mage',
      signal,
    })).resolves.toEqual({
      images: [{ bytes: new Uint8Array(png), mimeType: 'image/png' }],
      responseId: 'response-1',
    })
    expect(getAuth).toHaveBeenCalledWith(model, { signal })

    const [url, init] = request.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-api-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      input: [{
        content: [
          { text: 'Create a Q-style pixel-art mage', type: 'input_text' },
          {
            image_url: `data:image/png;base64,${png.toString('base64')}`,
            type: 'input_image',
          },
        ],
        role: 'user',
      }],
      model: 'gpt-5.6-sol',
      stream: false,
      tool_choice: { type: 'image_generation' },
      tools: [{
        background: 'auto',
        output_format: 'png',
        quality: 'auto',
        size: 'auto',
        type: 'image_generation',
      }],
    })
  })

  it('uses Codex OAuth headers and parses the streamed image result', async () => {
    const accessToken = jwt({
      'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' },
    })
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response([
      `data: ${JSON.stringify({
        item: {
          id: 'image-call-1',
          result: png.toString('base64'),
          status: 'completed',
          type: 'image_generation_call',
        },
        type: 'response.output_item.done',
      })}`,
      'data: [DONE]',
      '',
    ].join('\n\n'), {
      headers: { 'content-type': 'text/event-stream' },
      status: 200,
    }))
    const service = new OpenAiImageGenerationService({
      fetch: request,
      modelRuntime: {
        getAuth: async () => ({ auth: { apiKey: accessToken }, source: 'OAuth' }),
      },
    })

    await expect(service.generate({
      inputImages: [],
      model: codexModel(),
      prompt: 'Create a new image',
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      images: [{ bytes: new Uint8Array(png), mimeType: 'image/png' }],
    })

    const [url, init] = request.mock.calls[0]!
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${accessToken}`)
    expect(headers.get('chatgpt-account-id')).toBe('account-1')
    expect(headers.get('openai-beta')).toBe('responses=experimental')
    expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true })
  })

  it('exposes the capability only for owned OpenAI Responses providers', () => {
    expect(supportsOpenAiImageGeneration(openAiModel())).toBe(true)
    expect(supportsOpenAiImageGeneration(codexModel())).toBe(true)
    expect(supportsOpenAiImageGeneration({
      ...openAiModel(),
      provider: 'custom-openai-compatible',
    })).toBe(false)
  })

  it('keeps safe provider diagnostics without exposing the provider message', async () => {
    const service = new OpenAiImageGenerationService({
      fetch: async () => new Response(JSON.stringify({
        error: {
          code: 'invalid_value',
          message: 'private provider implementation detail',
          param: 'tools[0].background',
        },
      }), {
        headers: { 'x-request-id': 'req_image_1' },
        status: 400,
      }),
      modelRuntime: {
        getAuth: async () => ({ auth: { apiKey: 'private-api-key' } }),
      },
    })

    await expect(service.generate({
      inputImages: [],
      model: openAiModel(),
      prompt: 'Create a new image',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: 'IMAGE_GENERATION_FAILED',
      diagnostic: {
        providerCode: 'invalid_value',
        providerParameter: 'tools[0].background',
        requestId: 'req_image_1',
      },
      message: 'Lexora Buddy image generation failed',
    })
  })

  it('normalizes auth resolver failures and preserves cancellation', async () => {
    const service = new OpenAiImageGenerationService({
      fetch: vi.fn(),
      modelRuntime: {
        getAuth: async () => {
          throw new Error('private credential resolver failure')
        },
      },
    })

    await expect(service.generate({
      inputImages: [],
      model: openAiModel(),
      prompt: 'Create a new image',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'PROVIDER_AUTHENTICATION_FAILED' })
  })

  it('stops reading an undeclared response once the bounded size is exceeded', async () => {
    let cancelled = false
    let pulls = 0
    const chunk = new Uint8Array(1024 * 1024)
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
      pull(controller) {
        pulls += 1
        if (pulls <= 50)
          controller.enqueue(chunk)
        else
          controller.close()
      },
    })
    const service = new OpenAiImageGenerationService({
      fetch: async () => new Response(body, { status: 200 }),
      modelRuntime: {
        getAuth: async () => ({ auth: { apiKey: 'private-api-key' } }),
      },
    })

    await expect(service.generate({
      inputImages: [],
      model: openAiModel(),
      prompt: 'Create a new image',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'IMAGE_GENERATION_RESPONSE_TOO_LARGE' })
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThan(50)
  })
})

function openAiModel(): Model<'openai-responses'> {
  return {
    api: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    contextWindow: 128_000,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id: 'gpt-5.6-sol',
    input: ['text', 'image'],
    maxTokens: 16_384,
    name: 'GPT-5.6 Sol',
    provider: 'openai',
    reasoning: true,
  }
}

function codexModel(): Model<'openai-codex-responses'> {
  return {
    ...openAiModel(),
    api: 'openai-codex-responses',
    baseUrl: 'https://chatgpt.com/backend-api',
    provider: 'openai-codex',
  }
}

function jwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.')
}
