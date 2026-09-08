import type { Api, Model } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { publicWebUrl } from '../../../../platform/network/publicWebTransport'
import { buildNativeSearchRequest, NativeSearchResultCollector } from '../NativeWebSearch'

describe('public web boundaries', () => {
  it('blocks non-public URLs', () => {
    for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://[::ffff:127.0.0.1]', 'http://[::1]', 'https://[fc00::1]/', 'http://10.1.2.3', 'http://198.18.1.2', 'http://metadata.google.internal', 'https://metadata.oraclecloud.com/', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://example.com:3000']) {
      expect(() => publicWebUrl(url)).toThrow('WEB_URL_BLOCKED')
    }
  })
})

describe('native search proof', () => {
  it('does not accept linked generated text as proof of searching', () => {
    const collector = new NativeSearchResultCollector('openai')
    collector.accept({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', title: 'Example', url: 'https://example.com' }] }] }] } })
    expect(() => collector.result()).toThrow('WEB_NATIVE_SEARCH_NOT_USED')
  })
  it('rejects a severed stream after the search has started', () => {
    const collector = new NativeSearchResultCollector('openai')
    collector.accept({ type: 'response.output_item.done', item: { type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://example.com' }] } } })
    expect(() => collector.result()).toThrow('WEB_INVALID_RESPONSE')
  })
  it('sends only the supplied query and reuses resolved account authentication', () => {
    const model = { api: 'openai-codex-responses', provider: 'openai-codex', id: 'test-model', baseUrl: 'https://chatgpt.com/backend-api' } as Model<Api>
    const request = buildNativeSearchRequest(model, { auth: { apiKey: 'redacted-test-token', headers: { 'chatgpt-account-id': 'test-account' } } }, 'Only this query')
    expect(request.url).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(request.headers.get('chatgpt-account-id')).toBe('test-account')
    expect(request.body).toMatchObject({ store: false, tool_choice: 'required', tools: [{ type: 'web_search' }], input: [{ role: 'user', content: [{ type: 'input_text', text: expect.stringContaining('Only this query') }] }] })
    expect(Object.keys(request.body)).not.toContain('conversation')
  })
})
