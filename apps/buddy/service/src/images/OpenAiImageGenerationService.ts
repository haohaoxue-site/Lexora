import type {
  Api,
  AuthResult,
  Model,
} from '@earendil-works/pi-ai'
import type {
  ImageGenerationErrorDiagnostic,
  ImageGenerationGateway,
  ImageGenerationInput,
  ImageGenerationResult,
} from './ImageGenerationGateway'
import { Buffer } from 'node:buffer'
import { ImageGenerationError } from './ImageGenerationGateway'

const MAX_GENERATED_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_RESPONSE_BYTES = Math.ceil(MAX_GENERATED_IMAGE_BYTES * 4 / 3) + 2 * 1024 * 1024
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

export interface OpenAiImageGenerationServiceOptions {
  fetch?: typeof globalThis.fetch
  modelRuntime: {
    getAuth: (
      model: Model<Api>,
      options?: { signal?: AbortSignal },
    ) => Promise<AuthResult | undefined>
  }
}

export class OpenAiImageGenerationService implements ImageGenerationGateway {
  readonly #fetch: typeof globalThis.fetch
  readonly #modelRuntime: OpenAiImageGenerationServiceOptions['modelRuntime']

  constructor(options: OpenAiImageGenerationServiceOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#modelRuntime = options.modelRuntime
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    if (!supportsOpenAiImageGeneration(input.model))
      throw new ImageGenerationError('IMAGE_GENERATION_UNSUPPORTED')
    input.signal.throwIfAborted()
    let auth: AuthResult | undefined
    try {
      auth = await this.#modelRuntime.getAuth(input.model, { signal: input.signal })
    }
    catch (error) {
      input.signal.throwIfAborted()
      throw new ImageGenerationError('PROVIDER_AUTHENTICATION_FAILED', { cause: error })
    }
    const apiKey = auth?.auth.apiKey
    if (!auth || !apiKey)
      throw new ImageGenerationError('PROVIDER_AUTHENTICATION_FAILED')

    const codex = input.model.api === 'openai-codex-responses'
    const headers = createHeaders(input.model, auth, codex)
    const endpoint = resolveEndpoint(input.model, auth, codex)
    const response = await this.#fetch(endpoint, {
      body: JSON.stringify(createRequestBody(input, codex)),
      headers,
      method: 'POST',
      signal: input.signal,
    })
    const body = await readBoundedResponse(response)
    if (!response.ok) {
      throw new ImageGenerationError(normalizeProviderError(response.status), {
        diagnostic: readProviderErrorDiagnostic(response, body),
      })
    }

    const output = codex
      ? parseSseOutput(body)
      : parseJsonOutput(body)
    if (output.images.length === 0)
      throw new ImageGenerationError('IMAGE_GENERATION_FAILED')
    return output
  }

  supports(model: Model<Api>): boolean {
    return supportsOpenAiImageGeneration(model)
  }
}

export function supportsOpenAiImageGeneration(model: Model<Api>): boolean {
  return (
    model.provider === 'openai'
    && model.api === 'openai-responses'
  ) || (
    model.provider === 'openai-codex'
    && model.api === 'openai-codex-responses'
  )
}

function createRequestBody(input: ImageGenerationInput, stream: boolean) {
  return {
    input: [{
      content: [
        { text: input.prompt, type: 'input_text' },
        ...input.inputImages.map(image => ({
          image_url: `data:${image.mimeType};base64,${image.data}`,
          type: 'input_image',
        })),
      ],
      role: 'user',
    }],
    model: input.model.id,
    parallel_tool_calls: false,
    store: false,
    stream,
    tool_choice: { type: 'image_generation' },
    tools: [{
      action: input.inputImages.length > 0 ? 'edit' : 'generate',
      background: 'auto',
      output_format: 'png',
      quality: 'auto',
      size: 'auto',
      type: 'image_generation',
    }],
  }
}

function createHeaders(
  model: Model<Api>,
  auth: AuthResult,
  codex: boolean,
): Headers {
  const headers = new Headers(model.headers)
  for (const [name, value] of Object.entries(auth.auth.headers ?? {})) {
    if (value === null)
      headers.delete(name)
    else
      headers.set(name, value)
  }
  headers.set('authorization', `Bearer ${auth.auth.apiKey}`)
  headers.set('content-type', 'application/json')
  if (!codex)
    return headers

  const accountId = extractChatGptAccountId(auth.auth.apiKey!)
  headers.set('accept', 'text/event-stream')
  headers.set('chatgpt-account-id', accountId)
  headers.set('openai-beta', 'responses=experimental')
  headers.set('originator', 'pi')
  return headers
}

function resolveEndpoint(model: Model<Api>, auth: AuthResult, codex: boolean): string {
  const baseUrl = (auth.auth.baseUrl ?? model.baseUrl).replace(/\/+$/, '')
  return codex ? `${baseUrl}/codex/responses` : `${baseUrl}/responses`
}

function extractChatGptAccountId(token: string): string {
  try {
    const parts = token.split('.')
    if (parts.length !== 3)
      throw new Error('invalid token')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as unknown
    const auth = readRecord(readRecord(payload)?.['https://api.openai.com/auth'])
    const accountId = auth?.chatgpt_account_id
    if (typeof accountId !== 'string' || !accountId)
      throw new Error('missing account')
    return accountId
  }
  catch (error) {
    throw new ImageGenerationError('PROVIDER_AUTHENTICATION_FAILED', { cause: error })
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new ImageGenerationError('IMAGE_GENERATION_RESPONSE_TOO_LARGE')
  }
  if (!response.body)
    return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let receivedBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done)
      return parts.join('') + decoder.decode()
    receivedBytes += chunk.value.byteLength
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new ImageGenerationError('IMAGE_GENERATION_RESPONSE_TOO_LARGE')
    }
    parts.push(decoder.decode(chunk.value, { stream: true }))
  }
}

function parseJsonOutput(body: string): ImageGenerationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch (error) {
    throw new ImageGenerationError('IMAGE_GENERATION_INVALID_RESPONSE', { cause: error })
  }
  const record = readRecord(parsed)
  return {
    images: extractImages(record?.output),
    responseId: readString(record, 'id'),
  }
}

function parseSseOutput(body: string): ImageGenerationResult {
  const outputItems: unknown[] = []
  let responseId: string | null = null
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:'))
      continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]')
      continue
    let event: unknown
    try {
      event = JSON.parse(data)
    }
    catch (error) {
      throw new ImageGenerationError('IMAGE_GENERATION_INVALID_RESPONSE', { cause: error })
    }
    const eventRecord = readRecord(event)
    const response = readRecord(eventRecord?.response)
    responseId = readString(response, 'id') ?? responseId
    if (Array.isArray(response?.output))
      outputItems.push(...response.output)
    const item = readRecord(eventRecord?.item)
    if (item)
      outputItems.push(item)
  }
  return { images: extractImages(outputItems), responseId }
}

function extractImages(output: unknown): ImageGenerationResult['images'] {
  if (!Array.isArray(output))
    return []
  const seen = new Set<string>()
  return output.flatMap((item) => {
    const record = readRecord(item)
    if (record?.type !== 'image_generation_call' || record.status === 'failed')
      return []
    const result = readString(record, 'result')
    if (!result || seen.has(result))
      return []
    seen.add(result)
    return [{ bytes: decodePng(result), mimeType: 'image/png' as const }]
  })
}

function decodePng(value: string): Uint8Array {
  if (!/^[A-Z0-9+/]*={0,2}$/i.test(value))
    throw new ImageGenerationError('IMAGE_GENERATION_INVALID_RESPONSE')
  const bytes = Buffer.from(value, 'base64')
  if (
    bytes.byteLength > MAX_GENERATED_IMAGE_BYTES
    || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new ImageGenerationError('IMAGE_GENERATION_INVALID_RESPONSE')
  }
  return new Uint8Array(bytes)
}

function normalizeProviderError(status: number) {
  if (status === 401)
    return 'PROVIDER_AUTHENTICATION_FAILED'
  if (status === 403)
    return 'PROVIDER_ACCESS_DENIED'
  if (status === 429)
    return 'PROVIDER_RATE_LIMITED'
  return 'IMAGE_GENERATION_FAILED'
}

function readProviderErrorDiagnostic(
  response: Response,
  body: string,
): ImageGenerationErrorDiagnostic | undefined {
  let error: Record<string, unknown> | null = null
  try {
    error = readRecord(readRecord(JSON.parse(body))?.error)
  }
  catch {}
  const providerCode = readDiagnosticValue(error?.code)
  const providerParameter = readDiagnosticValue(error?.param)
    ?? readDiagnosticValue(error?.parameter)
  const requestId = readDiagnosticValue(response.headers.get('x-request-id'))
    ?? readDiagnosticValue(response.headers.get('openai-request-id'))
  if (!providerCode && !providerParameter && !requestId)
    return undefined
  return {
    ...(providerCode ? { providerCode } : {}),
    ...(providerParameter ? { providerParameter } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

function readDiagnosticValue(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const result = value.trim()
  return result && result.length <= 256 && isDiagnosticToken(result)
    ? result
    : null
}

function isDiagnosticToken(value: string): boolean {
  const allowedCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-[]:/'
  return [...value].every(character => allowedCharacters.includes(character))
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
  const candidate = value?.[key]
  return typeof candidate === 'string' && candidate ? candidate : null
}
