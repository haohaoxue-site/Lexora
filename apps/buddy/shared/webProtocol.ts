import { z } from 'zod'

export const WEB_SEARCH_PROVIDERS = ['native', 'tavily', 'google', 'bing', 'duckduckgo', 'brave'] as const
export const webSearchSourceSchema = z.object({
  provider: z.enum(WEB_SEARCH_PROVIDERS),
  enabled: z.boolean(),
}).strict()
export type WebSearchSource = z.infer<typeof webSearchSourceSchema>
export type WebSearchProvider = WebSearchSource['provider']

export const webSettingsSchema = z.object({
  search: z.array(webSearchSourceSchema).length(WEB_SEARCH_PROVIDERS.length).refine(sources => new Set(sources.map(source => source.provider)).size === WEB_SEARCH_PROVIDERS.length),
  fetch: z.object({
    render: z.boolean(),
    remote: z.boolean(),
  }).strict(),
}).strict()

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  search: WEB_SEARCH_PROVIDERS.map(provider => ({ provider, enabled: provider !== 'tavily' })),
  fetch: { render: true, remote: false },
}

export const webSettingsSnapshotSchema = z.object({
  settings: webSettingsSchema,
  tavilyKeyConfigured: z.boolean(),
}).strict()

export const webCredentialInputSchema = z.object({
  key: z.string().trim().min(1).max(4096).nullable(),
}).strict()

export const WEB_ERROR_CODES = [
  'WEB_PROVIDER_UNAVAILABLE',
  'WEB_NETWORK_ERROR',
  'WEB_HTTP_ERROR',
  'WEB_RATE_LIMITED',
  'WEB_ACCESS_DENIED',
  'WEB_CHALLENGE',
  'WEB_URL_BLOCKED',
  'WEB_UNSUPPORTED_CONTENT',
  'WEB_EMPTY_CONTENT',
  'WEB_RENDER_REQUIRED',
  'WEB_RESPONSE_TOO_LARGE',
  'WEB_CACHE_FAILED',
  'WEB_INVALID_RESPONSE',
  'WEB_NATIVE_SEARCH_NOT_USED',
  'WEB_TIMEOUT',
  'WEB_CANCELLED',
  'WEB_BUSY',
] as const

export const webErrorCodeSchema = z.enum(WEB_ERROR_CODES)
export type WebErrorCode = z.infer<typeof webErrorCodeSchema>
export type WebSettings = z.infer<typeof webSettingsSchema>
export type WebSettingsSnapshot = z.infer<typeof webSettingsSnapshotSchema>

export const webRenderInputSchema = z.object({
  requestId: z.uuid(),
  url: z.string().min(1).max(4096),
}).strict()
export const webRenderCancelSchema = webRenderInputSchema.pick({ requestId: true })
export const webRenderResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    url: z.string().max(4096),
    html: z.string().max(4 * 1024 * 1024),
  }).strict(),
  z.object({ ok: z.literal(false), code: webErrorCodeSchema }).strict(),
])
export type WebRenderResult = z.infer<typeof webRenderResultSchema>

export const webNetworkRequestSchema = z.object({
  requestId: z.uuid(),
  url: z.string().min(1).max(4096),
  scope: z.enum(['public', 'provider']),
  method: z.enum(['GET', 'POST']),
  headers: z.record(z.string().max(256), z.string().max(16 * 1024)),
  body: z.string().max(64 * 1024).optional(),
  limit: z.number().int().min(1).max(12 * 1024 * 1024),
}).strict()
export type WebNetworkRequest = z.infer<typeof webNetworkRequestSchema>
export const webNetworkHeadSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), status: z.number().int().min(200).max(599), headers: z.record(z.string(), z.string()), url: z.string() }).strict(),
  z.object({ ok: z.literal(false), code: webErrorCodeSchema }).strict(),
])
export const webNetworkChunkSchema = z.object({
  requestId: z.uuid(),
  chunk: z.string().max(128 * 1024).optional(),
  done: z.boolean().optional(),
  code: webErrorCodeSchema.optional(),
}).strict()

export class WebError extends Error {
  readonly code: WebErrorCode
  readonly status?: number

  constructor(code: WebErrorCode, status?: number) {
    super(code)
    this.code = code
    this.status = status
    this.name = 'WebError'
  }
}

export function webError(error: unknown, signal?: AbortSignal): WebError {
  if (signal?.aborted)
    return new WebError(signal.reason?.name === 'TimeoutError' ? 'WEB_TIMEOUT' : 'WEB_CANCELLED')
  return error instanceof WebError ? error : new WebError('WEB_NETWORK_ERROR')
}
