import { describe, expect, it } from 'vitest'
import {
  BROWSER_ADAPTER_MAX_LEASE_TTL_MS,
  browserAdapterFailureResponseSchema,
  browserAdapterIssueLeaseParamsSchema,
  browserAdapterLeaseSchema,
  browserAdapterRequestSchema,
} from '../browserAdapterProtocol'

const token = 'a'.repeat(64)
const conversationId = 'conversation-browser-adapter'
const sessionId = '6f828cc1-6549-4245-b26e-43b2917c9281'
const pageId = 'ed312709-baf9-44b3-a292-108055838477'

describe('browserAdapterProtocol', () => {
  it('accepts local Windows named pipes and rejects remote or file endpoints', () => {
    const lease = {
      conversationId,
      expiresAt: '2026-09-02T00:01:00.000Z',
      pageId,
      protocolVersion: 1,
      sessionId,
      token,
    }
    expect(browserAdapterLeaseSchema.parse({
      ...lease,
      socketPath: '\\\\.\\pipe\\lexora-buddy-browser-fixture',
    }).socketPath).toBe('\\\\.\\pipe\\lexora-buddy-browser-fixture')
    for (const socketPath of ['C:\\Temp\\browser.sock', '\\\\remote\\pipe\\browser', '\\\\.\\pipe\\..\\browser'])
      expect(browserAdapterLeaseSchema.safeParse({ ...lease, socketPath }).success).toBe(false)
  })

  it('bounds lease issuance and rejects unknown fields', () => {
    expect(browserAdapterIssueLeaseParamsSchema.parse({
      conversationId,
    })).toEqual({ conversationId })
    expect(browserAdapterIssueLeaseParamsSchema.parse({
      conversationId,
      ttlMs: BROWSER_ADAPTER_MAX_LEASE_TTL_MS,
    }).ttlMs).toBe(BROWSER_ADAPTER_MAX_LEASE_TTL_MS)
    expect(() => browserAdapterIssueLeaseParamsSchema.parse({
      conversationId,
      ttlMs: BROWSER_ADAPTER_MAX_LEASE_TTL_MS + 1,
    })).toThrow()
    expect(() => browserAdapterIssueLeaseParamsSchema.parse({
      conversationId,
      extra: true,
    })).toThrow()
  })

  it('accepts only versioned state, snapshot, action, and close requests', () => {
    const base = { id: 'request-1', protocolVersion: 1, token }
    for (const request of [
      { ...base, method: 'state', params: {} },
      { ...base, method: 'snapshot', params: { maxElements: 40 } },
      {
        ...base,
        method: 'action',
        params: {
          action: { kind: 'reload' },
          documentRevision: 2,
          observationId: 'cece2ce7-4a79-478a-9008-c0df264095ba',
          pageId,
        },
      },
      { ...base, method: 'close', params: {} },
    ]) {
      expect(browserAdapterRequestSchema.parse(request)).toEqual(request)
    }
    expect(() => browserAdapterRequestSchema.parse({
      ...base,
      method: 'cdp',
      params: {},
    })).toThrow()
    expect(() => browserAdapterRequestSchema.parse({
      ...base,
      method: 'state',
      params: { sessionId },
    })).toThrow()
    expect(() => browserAdapterRequestSchema.parse({
      ...base,
      method: 'state',
      params: {},
      token: 'short',
    })).toThrow()
  })

  it('uses strict stable failures without diagnostic text', () => {
    const response = {
      error: {
        code: 'BROWSER_ADAPTER_APPROVAL_REQUIRED',
        recovery: 'request_buddy_approval',
      },
      id: 'request-1',
      ok: false,
      protocolVersion: 1,
    }
    expect(browserAdapterFailureResponseSchema.parse(response)).toEqual(response)
    expect(() => browserAdapterFailureResponseSchema.parse({
      ...response,
      error: { ...response.error, message: 'internal diagnostic' },
    })).toThrow()
  })
})
