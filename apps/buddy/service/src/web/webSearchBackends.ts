import type { ProviderWebFetch, PublicWebGet } from '../../../shared/network/publicWebTransport'
import type { WebSearchProvider } from '../../../shared/webProtocol'
import { Buffer } from 'node:buffer'
import { parseHTML } from 'linkedom'
import { z } from 'zod'
import { publicWebUrl, readResponseBytes, requireWebSuccess } from '../../../shared/network/publicWebTransport'
import { WebError } from '../../../shared/webProtocol'
import { decodeWebText } from './webContent'

export interface WebSearchSource {
  title: string
  url: string
  snippet?: string
}

export interface WebSearchResponse {
  sources: WebSearchSource[]
  generatedSummary?: string
  usage?: { inputTokens?: number, outputTokens?: number, credits?: number, cost: null }
}

type PublicSearchProvider = Exclude<WebSearchProvider, 'native' | 'tavily'>
interface PublicSearchDefinition { endpoint: string, result: string, anchor: string, title: string, snippet: string, empty?: string }

const PUBLIC_SEARCH: Record<PublicSearchProvider, PublicSearchDefinition> = {
  bing: {
    endpoint: 'https://www.bing.com/search',
    result: '#b_results .b_algo',
    anchor: 'h2 a',
    title: 'h2',
    snippet: '.b_caption p, .b_snippet',
    empty: '#b_results .b_no, #b_results .b_msg',
  },
  brave: {
    endpoint: 'https://search.brave.com/search',
    result: '.snippet[data-type="web"]',
    anchor: '.result-content > a, a.heading-serpresult',
    title: '.search-snippet-title, .title',
    snippet: '.generic-snippet, .snippet-description',
    empty: '#results .no-results',
  },
  duckduckgo: {
    endpoint: 'https://html.duckduckgo.com/html/',
    result: '#links .web-result:not(.result--ad)',
    anchor: 'h2 a',
    title: 'h2',
    snippet: '.result__snippet',
    empty: '#links .no-results',
  },
  google: {
    endpoint: 'https://www.google.com/search',
    result: '#search .MjjYud:has(h3), #search .g:has(h3)',
    anchor: 'a:has(h3)',
    title: 'h3',
    snippet: '.VwiC3b, .IsZvec',
  },
}

export function searchSourceUrl(raw: string, base?: string): string | null {
  try {
    return publicWebUrl(new URL(raw, base).href).href
  }
  catch { return null }
}

function publicSearchTarget(href: string, provider: PublicSearchProvider): URL | null {
  const base = new URL(PUBLIC_SEARCH[provider].endpoint)
  try {
    let target = new URL(href, base)
    if (provider === 'bing' && /(?:^|\.)bing\.com$/.test(target.hostname) && target.pathname === '/ck/a') {
      const encoded = target.searchParams.get('u') ?? ''
      target = new URL(Buffer.from(encoded.replace(/^a1/, ''), 'base64url').toString('utf8'))
    }
    if (provider === 'duckduckgo' && /(?:^|\.)duckduckgo\.com$/.test(target.hostname) && /^\/l\/?$/.test(target.pathname))
      target = new URL(target.searchParams.get('uddg') ?? '')
    if (provider === 'google' && /(?:^|\.)google\.com$/.test(target.hostname) && target.pathname === '/url')
      target = new URL(target.searchParams.get('q') ?? target.searchParams.get('url') ?? '')
    return target.origin === base.origin ? null : publicWebUrl(target.href)
  }
  catch { return null }
}

export function parsePublicSearch(html: string, provider: PublicSearchProvider, responseUrl?: string): WebSearchSource[] {
  const definition = PUBLIC_SEARCH[provider]
  const { document } = parseHTML(html)
  if (provider === 'google') {
    const target = new URL(responseUrl ?? definition.endpoint)
    if (target.hostname === 'sorry.google.com' || target.pathname.startsWith('/sorry/')
      || document.querySelector('#captcha-form, .g-recaptcha, form[action*="/sorry/"], meta[content*="/sorry/"]')) {
      throw new WebError('WEB_CHALLENGE')
    }
    if (target.hostname === 'consent.google.com' || document.querySelector('form[action^="https://consent.google.com/"]'))
      throw new WebError('WEB_ACCESS_DENIED')
    if (document.querySelector('a[href^="/httpservice/retry/enablejs"], meta[content*="/httpservice/retry/enablejs"]'))
      throw new WebError('WEB_RENDER_REQUIRED')
  }
  if (document.querySelector('#b_captcha, #challenge-form, .anomaly-modal__modal, form[action*="captcha"]')
    || /^(?:just a moment|verify|captcha|robot|security)/i.test(document.title ?? '')) {
    throw new WebError('WEB_CHALLENGE')
  }
  const results: WebSearchSource[] = []
  for (const item of document.querySelectorAll(definition.result)) {
    const anchor = item.querySelector(definition.anchor)
    const href = anchor?.getAttribute('href')
    if (!href)
      continue
    const target = publicSearchTarget(href, provider)
    if (!target || results.some(source => source.url === target.href))
      continue
    const title = (item.querySelector(definition.title)?.textContent || anchor?.textContent || target.hostname).replace(/\s+/g, ' ').trim().slice(0, 300)
    const snippet = item.querySelector(definition.snippet)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1500)
    results.push({ title, url: target.href, ...(snippet ? { snippet } : {}) })
    if (results.length === 8)
      break
  }
  if (!results.length && !(definition.empty && document.querySelector(definition.empty)))
    throw new WebError('WEB_INVALID_RESPONSE')
  return results
}

export async function publicWebSearch(get: PublicWebGet, provider: PublicSearchProvider, query: string, signal: AbortSignal): Promise<WebSearchResponse> {
  const definition = PUBLIC_SEARCH[provider]
  const url = new URL(definition.endpoint)
  url.searchParams.set('q', query)
  const resource = await get(url.href, signal, 4 * 1024 * 1024)
  requireWebSuccess(resource.status)
  return { sources: parsePublicSearch(decodeWebText(resource.bytes, resource.headers.get('content-type') ?? ''), provider, resource.url) }
}

export async function tavilyRequest(fetch: ProviderWebFetch, path: 'search' | 'extract', key: string, body: object, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`https://api.tavily.com/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    await response.body?.cancel()
    requireWebSuccess(response.status)
  }
  const bytes = await readResponseBytes(response, 12 * 1024 * 1024)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  }
  catch { throw new WebError('WEB_INVALID_RESPONSE') }
}

const tavilySearchSchema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string().optional() })),
  usage: z.object({ credits: z.number() }).optional(),
})

export async function tavilySearch(fetch: ProviderWebFetch, query: string, key: string, signal: AbortSignal): Promise<WebSearchResponse> {
  const result = tavilySearchSchema.safeParse(await tavilyRequest(fetch, 'search', key, {
    query,
    max_results: 8,
    search_depth: 'basic',
    include_answer: false,
    include_raw_content: false,
    include_usage: true,
  }, signal))
  if (!result.success)
    throw new WebError('WEB_INVALID_RESPONSE')
  return {
    sources: result.data.results.flatMap((source) => {
      const url = searchSourceUrl(source.url)
      return url ? [{ url, title: source.title.slice(0, 300), snippet: source.content?.slice(0, 1500) }] : []
    }),
    usage: { cost: null, credits: result.data.usage?.credits },
  }
}
