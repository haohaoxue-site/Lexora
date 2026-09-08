import { describe, expect, it } from 'vitest'
import { parsePublicSearch } from '../webSearchBackends'

function page(content: string) {
  return `<html><head><title>Search - Google Search</title></head><body><div id="search">${content}</div></body></html>`
}

function result(href: string, title = 'Documentation', snippet = 'Public source text') {
  return `<div class="MjjYud"><div class="g"><a href="${href}"><span>example.com › docs</span><h3>${title}</h3></a><div class="VwiC3b">${snippet}</div></div></div>`
}

describe('google public search', () => {
  it('extracts organic results, deduplicates nested cards and unwraps targets exactly once', () => {
    const target = 'https://example.com/docs?path=a%2Fb&lang=zh'
    expect(parsePublicSearch(page([
      result(`/url?q=${encodeURIComponent(target)}&amp;sa=U`, ' Official <b>documentation</b> '),
      result(target, 'Duplicate'),
      result('/url?url=https%3A%2F%2Fexample.org%2Freference', 'Reference'),
      result('https://example.net/direct', 'Direct'),
      '<div class="MjjYud"><a href="https://example.net/unrelated">Other section</a></div>',
      '<a href="https://accounts.google.com/">Sign in</a>',
      result('/search?q=related', 'Navigation'),
      result('/url?q=http%3A%2F%2F127.0.0.1%2Fprivate', 'Private'),
      result('/url?q=https%3A%2F%2Fname%3Asecret%40example.com', 'Credentials'),
      result('/url?q=javascript%3Aalert(1)', 'Script'),
      result('/url?q=http%3A%2F%2F%5Bbroken', 'Broken'),
      result('/url?sa=U', 'Missing target'),
    ].join('')), 'google')).toEqual([
      { title: 'Official documentation', url: target, snippet: 'Public source text' },
      { title: 'Reference', url: 'https://example.org/reference', snippet: 'Public source text' },
      { title: 'Direct', url: 'https://example.net/direct', snippet: 'Public source text' },
    ])
  })
})
