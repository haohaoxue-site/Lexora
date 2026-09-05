import type { Api, AuthResult, Model, Usage } from '@earendil-works/pi-ai'
import type { ProviderWebFetch } from '../../../shared/network/publicWebTransport'
import type { WebSearchResponse, WebSearchSource } from './webSearchBackends'
import { Buffer } from 'node:buffer'
import { calculateCost } from '@earendil-works/pi-ai'
import { requireWebSuccess } from '../../../shared/network/publicWebTransport'
import { WebError } from '../../../shared/webProtocol'
import { searchSourceUrl } from './webSearchBackends'

export interface NativeSearchModels {
  getAuth: (model: Model<Api>, options: { signal: AbortSignal }) => Promise<AuthResult | undefined>
}

type NativeFamily = 'openai' | 'google' | 'anthropic'
type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const string = (value: unknown): string => typeof value === 'string' ? value : ''

export function nativeSearchFamily(model?: Model<Api>): NativeFamily | null {
  if (!model)
    return null
  if (['openai-responses', 'openai-codex-responses'].includes(model.api))
    return 'openai'
  if (model.api === 'google-generative-ai')
    return 'google'
  if (model.api === 'anthropic-messages')
    return 'anthropic'
  return null
}

export function buildNativeSearchRequest(model: Model<Api>, auth: AuthResult, query: string): { url: string, headers: Headers, body: object } {
  const family = nativeSearchFamily(model)
  if (!family)
    throw new WebError('WEB_PROVIDER_UNAVAILABLE')
  const headers = new Headers(model.headers)
  for (const [key, value] of Object.entries(auth.auth.headers ?? {})) {
    if (value === null)
      headers.delete(key)
    else
      headers.set(key, value)
  }
  headers.set('content-type', 'application/json')
  headers.set('accept', 'text/event-stream')
  const base = (auth.auth.baseUrl || model.baseUrl).replace(/\/+$/, '')
  const key = auth.auth.apiKey
  const prompt = `Search the web for the following query. Use the web search tool and cite sources. Keep any generated summary brief.\n\n${query}`
  if (family === 'google') {
    if (key)
      headers.set('x-goog-api-key', key)
    return {
      url: `${base}/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse`,
      headers,
      body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 2048 } },
    }
  }
  if (family === 'anthropic') {
    if (key?.includes('sk-ant-oat'))
      throw new WebError('WEB_PROVIDER_UNAVAILABLE')
    if (key && !headers.has('authorization'))
      headers.set('x-api-key', key)
    headers.set('anthropic-version', '2023-06-01')
    return {
      url: `${base.endsWith('/v1') ? base : `${base}/v1`}/messages`,
      headers,
      body: { model: model.id, max_tokens: 2048, stream: true, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], tool_choice: { type: 'tool', name: 'web_search' } },
    }
  }
  if (key && !headers.has('authorization'))
    headers.set('authorization', `Bearer ${key}`)
  const codex = model.api === 'openai-codex-responses'
  if (codex) {
    if (!headers.has('chatgpt-account-id')) {
      try {
        const token = key || headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
        const payload = record(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')))
        const accountId = string(record(payload['https://api.openai.com/auth']).chatgpt_account_id)
        if (!accountId)
          throw new Error('Missing account')
        headers.set('chatgpt-account-id', accountId)
      }
      catch { throw new WebError('WEB_PROVIDER_UNAVAILABLE') }
    }
    headers.set('originator', 'pi')
    headers.set('openai-beta', 'responses=experimental')
  }
  return {
    url: `${codex && !base.endsWith('/codex') ? `${base}/codex` : base}/responses`,
    headers,
    body: {
      model: model.id,
      store: false,
      stream: true,
      instructions: 'Use web search to find sources for the supplied query.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      ...(!codex ? { max_output_tokens: 2048 } : {}),
    },
  }
}

export class NativeSearchResultCollector {
  readonly #sources = new Map<string, WebSearchSource>()
  #executed = false
  #completed = false
  #summary = ''
  #inputTokens: number | undefined
  #outputTokens: number | undefined
  #cacheRead = 0
  #cacheWrite = 0
  #cacheWrite1h = 0
  #reasoning: number | undefined

  readonly family: NativeFamily

  constructor(family: NativeFamily) { this.family = family }

  accept(value: unknown): boolean {
    const event = record(value)
    const type = string(event.type)
    if (this.family === 'openai') {
      const usage = record(record(event.response).usage)
      this.#usage(usage.input_tokens, usage.output_tokens)
      this.#cacheRead = tokenCount(record(usage.input_tokens_details).cached_tokens) ?? this.#cacheRead
      this.#cacheWrite = tokenCount(record(usage.input_tokens_details).cache_write_tokens) ?? this.#cacheWrite
      this.#reasoning = tokenCount(record(usage.output_tokens_details).reasoning_tokens) ?? this.#reasoning
    }
    if (type === 'error' || type === 'response.failed' || type === 'response.incomplete' || event.error)
      throw new WebError('WEB_INVALID_RESPONSE')
    if (this.family === 'openai') {
      if (type === 'response.output_text.delta')
        this.#summary += string(event.delta)
      if (type === 'response.output_text.annotation.added')
        this.#source(record(event.annotation))
      this.#openAiItem(record(event.item))
      if (type === 'response.completed' || type === 'response.done') {
        const response = record(event.response)
        if (response.status !== 'completed')
          throw new WebError('WEB_INVALID_RESPONSE')
        for (const item of list(response.output))
          this.#openAiItem(record(item))
        this.#completed = true
      }
    }
    else if (this.family === 'anthropic') {
      const block = record(event.content_block)
      if (block.type === 'web_search_tool_result') {
        if (!Array.isArray(block.content))
          throw new WebError('WEB_INVALID_RESPONSE')
        this.#executed = true
        for (const source of block.content)
          this.#source(record(source))
      }
      const delta = record(event.delta)
      if (delta.type === 'text_delta')
        this.#summary += string(delta.text)
      if (delta.type === 'citations_delta')
        this.#source(record(delta.citation))
      const usage = record(event.usage ?? record(event.message).usage)
      this.#usage(usage.input_tokens, usage.output_tokens)
      this.#cacheRead = tokenCount(usage.cache_read_input_tokens) ?? this.#cacheRead
      this.#cacheWrite = tokenCount(usage.cache_creation_input_tokens) ?? this.#cacheWrite
      this.#cacheWrite1h = tokenCount(record(usage.cache_creation).ephemeral_1h_input_tokens) ?? this.#cacheWrite1h
      this.#completed ||= type === 'message_stop'
    }
    else {
      const candidate = record(list(event.candidates)[0])
      for (const part of list(record(candidate.content).parts)) {
        if (!record(part).thought)
          this.#summary += string(record(part).text)
      }
      const grounding = record(candidate.groundingMetadata)
      if (list(grounding.webSearchQueries).some(query => typeof query === 'string' && query.length > 0))
        this.#executed = true
      for (const chunk of list(grounding.groundingChunks)) {
        const web = record(record(chunk).web)
        this.#source({ url: web.uri, title: web.title })
      }
      const usage = record(event.usageMetadata)
      this.#usage(usage.promptTokenCount, usage.candidatesTokenCount)
      this.#cacheRead = tokenCount(usage.cachedContentTokenCount) ?? this.#cacheRead
      this.#reasoning = tokenCount(usage.thoughtsTokenCount) ?? this.#reasoning
      this.#completed ||= candidate.finishReason === 'STOP'
    }
    if (this.#summary.length > 32 * 1024)
      throw new WebError('WEB_RESPONSE_TOO_LARGE')
    return this.#completed && this.family !== 'google'
  }

  result(): WebSearchResponse {
    if (!this.#completed)
      throw new WebError('WEB_INVALID_RESPONSE')
    if (!this.#executed)
      throw new WebError('WEB_NATIVE_SEARCH_NOT_USED')
    return {
      sources: [...this.#sources.values()].slice(0, 12),
      ...(this.#summary.trim() ? { generatedSummary: this.#summary.trim() } : {}),
      usage: { inputTokens: this.#inputTokens, outputTokens: this.#outputTokens, cost: null },
    }
  }

  modelUsage(model: Model<Api>): Usage | undefined {
    if (this.#inputTokens === undefined && this.#outputTokens === undefined)
      return undefined
    const input = this.family === 'anthropic' ? this.#inputTokens ?? 0 : Math.max(0, (this.#inputTokens ?? 0) - this.#cacheRead - this.#cacheWrite)
    const output = (this.#outputTokens ?? 0) + (this.family === 'google' ? this.#reasoning ?? 0 : 0)
    const usage: Usage = {
      input,
      output,
      cacheRead: this.#cacheRead,
      cacheWrite: this.#cacheWrite,
      ...(this.#cacheWrite1h ? { cacheWrite1h: this.#cacheWrite1h } : {}),
      ...(this.#reasoning !== undefined ? { reasoning: this.#reasoning } : {}),
      totalTokens: input + output + this.#cacheRead + this.#cacheWrite,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    }
    calculateCost(model, usage)
    return usage
  }

  #openAiItem(item: RecordValue): void {
    if (item.type === 'web_search_call' && item.status === 'completed') {
      this.#executed = true
      for (const source of list(record(item.action).sources))
        this.#source(record(source))
    }
    if (item.type === 'message') {
      for (const content of list(item.content)) {
        for (const citation of list(record(content).annotations))
          this.#source(record(citation))
      }
    }
  }

  #source(source: RecordValue): void {
    const url = searchSourceUrl(string(source.url))
    if (url && this.#sources.size < 40)
      this.#sources.set(url, { url, title: (string(source.title) || new URL(url).hostname).slice(0, 300) })
  }

  #usage(input: unknown, output: unknown): void {
    this.#inputTokens = tokenCount(input) ?? this.#inputTokens
    this.#outputTokens = tokenCount(output) ?? this.#outputTokens
  }
}

export async function nativeWebSearch(fetch: ProviderWebFetch, models: NativeSearchModels, model: Model<Api>, query: string, signal: AbortSignal, onUsage?: (usage: Usage) => void): Promise<WebSearchResponse> {
  const family = nativeSearchFamily(model)
  if (!family)
    throw new WebError('WEB_PROVIDER_UNAVAILABLE')
  const auth = await models.getAuth(model, { signal })
  if (!auth)
    throw new WebError('WEB_PROVIDER_UNAVAILABLE')
  const request = buildNativeSearchRequest(model, auth, query)
  const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal })
  if (!response.ok) {
    await response.body?.cancel()
    requireWebSuccess(response.status)
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    await response.body?.cancel()
    throw new WebError('WEB_INVALID_RESPONSE')
  }
  const collector = new NativeSearchResultCollector(family)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      bytes += chunk.value.byteLength
      if (bytes > 4 * 1024 * 1024)
        throw new WebError('WEB_RESPONSE_TOO_LARGE')
      buffer += decoder.decode(chunk.value, { stream: true })
      while (true) {
        const match = /\r?\n\r?\n/.exec(buffer)
        if (!match)
          break
        const frame = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]')
          continue
        let event: unknown
        try {
          event = JSON.parse(data) as unknown
        }
        catch { throw new WebError('WEB_INVALID_RESPONSE') }
        if (collector.accept(event))
          return collector.result()
      }
    }
    return collector.result()
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
    const usage = collector.modelUsage(model)
    if (usage)
      onUsage?.(usage)
  }
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
