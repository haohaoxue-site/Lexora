import { describe, expect, it } from 'vitest'
import { parsePublicSearch } from '../webSearchBackends'

function page(results: string) {
  return `<html><head><title>Search at DuckDuckGo</title></head><body><div id="links">${results}</div></body></html>`
}

function result(href: string, title = 'Source', extraClass = '') {
  return `<div class="result web-result ${extraClass}"><h2><a class="result__a" href="${href}">${title}</a></h2><a class="result__snippet">Public <b>source</b> text</a></div>`
}

describe('duckDuckGo public HTML search', () => {
  it('extracts organic sources, unwraps redirects and preserves semantic URL parameters', () => {
    const target = 'https://example.com/docs?ref=main&lang=zh'
    const html = page([
      result(`//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}&rut=tracking`, ' Documentation '),
      result(target, 'Duplicate'),
      result('https://example.org/reference', 'Reference'),
      result('https://example.net/advert', 'Advertisement', 'result--ad'),
      result('/l/?uddg=http%3A%2F%2F127.0.0.1%2Fsecret', 'Private'),
      result('http://[broken', 'Broken'),
      result('/l/?rut=tracking', 'Missing target'),
      result('javascript:alert(1)', 'Script'),
    ].join(''))
    expect(parsePublicSearch(html, 'duckduckgo')).toEqual([
      { url: target, title: 'Documentation', snippet: 'Public source text' },
      { url: 'https://example.org/reference', title: 'Reference', snippet: 'Public source text' },
    ])
  })

  it('reports challenge pages instead of search results', () => {
    for (const challenge of ['<form id="challenge-form"></form>', '<div class="anomaly-modal__modal">Human verification</div>']) {
      expect(() => parsePublicSearch(page(challenge + result('https://example.com')), 'duckduckgo')).toThrow('WEB_CHALLENGE')
    }
  })
})
