import { describe, expect, it } from 'vitest'
import {
  isAllowedExternalUrl,
  isAllowedRendererNavigation,
  resolveDevelopmentRendererUrl,
} from '../navigationPolicy'

describe('electron navigation policy', () => {
  it('allows only the exact renderer document and its hash changes', () => {
    const rendererUrl = 'http://127.0.0.1:1420/chat'

    expect(isAllowedRendererNavigation(rendererUrl, rendererUrl)).toBe(true)
    expect(isAllowedRendererNavigation(`${rendererUrl}#settings`, rendererUrl)).toBe(true)
    expect(isAllowedRendererNavigation('http://127.0.0.1:1420/panel', rendererUrl)).toBe(false)
    expect(isAllowedRendererNavigation('http://localhost:1420/chat', rendererUrl)).toBe(false)
    expect(isAllowedRendererNavigation('https://example.com/', rendererUrl)).toBe(false)
  })

  it('supports the exact packaged app URL without granting file access', () => {
    const rendererUrl = 'lexora-app://renderer/index.html'

    expect(isAllowedRendererNavigation(`${rendererUrl}#chat`, rendererUrl)).toBe(true)
    expect(isAllowedRendererNavigation('lexora-app://renderer/settings.html', rendererUrl)).toBe(false)
    expect(isAllowedRendererNavigation('file:///etc/passwd', rendererUrl)).toBe(false)
  })

  it('opens only HTTPS links as external browser targets', () => {
    expect(isAllowedExternalUrl('https://openai.com/')).toBe(true)
    expect(isAllowedExternalUrl('http://openai.com/')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/secret')).toBe(false)
    expect(isAllowedExternalUrl('not a URL')).toBe(false)
  })

  it('accepts a loopback development renderer only in unpackaged builds', () => {
    expect(resolveDevelopmentRendererUrl('http://127.0.0.1:5173', false))
      .toBe('http://127.0.0.1:5173/')
    expect(resolveDevelopmentRendererUrl('http://localhost:5173', false))
      .toBe('http://localhost:5173/')
    expect(resolveDevelopmentRendererUrl('https://example.com', false)).toBeNull()
    expect(resolveDevelopmentRendererUrl('http://127.0.0.1:5173', true)).toBeNull()
  })
})
