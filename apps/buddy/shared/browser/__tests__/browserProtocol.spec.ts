import { describe, expect, it } from 'vitest'
import {
  BROWSER_ACTION_TEXT_MAX_LENGTH,
  BROWSER_MAX_WAIT_TIMEOUT_MS,
  browserAcquireControlParamsSchema,
  browserActionSchema,
  browserActParamsSchema,
  browserCapabilityActParamsSchema,
  browserControlLeaseSchema,
  browserObservationSchema,
  browserReleaseControlParamsSchema,
} from '..'

const SESSION_ID = '6f828cc1-6549-4245-b26e-43b2917c9281'
const PAGE_ID = 'ed312709-baf9-44b3-a292-108055838477'
const OBSERVATION_ID = 'b3a5d63b-17b7-4b5a-863a-37f135e297d4'

const OBSERVATION = {
  documentRevision: 2,
  elements: [
    {
      actions: ['click'],
      frameId: 'main-frame',
      name: 'Continue',
      ref: 'e1',
      role: 'button',
      states: ['focusable'],
    },
    {
      actions: [],
      frameId: 'main-frame',
      inputMode: 'human',
      name: 'Password',
      ref: 'e2',
      role: 'textbox',
      states: ['editable'],
      valueState: 'redacted',
    },
  ],
  observationId: OBSERVATION_ID,
  pageId: PAGE_ID,
  sessionId: SESSION_ID,
  status: 'ready',
  title: 'Example',
  truncated: false,
  url: 'https://example.com/docs',
} as const

describe('browser host protocol', () => {
  it('bounds action payloads without arbitrary selectors, scripts, keys, or waits', () => {
    const rejectedActions = [
      { kind: 'navigate', url: 'javascript:alert(1)' },
      { kind: 'click', ref: 'e1', selector: '#submit' },
      { kind: 'click', ref: 'button.primary' },
      { kind: 'fill', ref: 'e1', text: 'x'.repeat(BROWSER_ACTION_TEXT_MAX_LENGTH + 1) },
      { kind: 'type', ref: 'e1', text: '' },
      { key: 'Control+Shift+I', kind: 'press' },
      { kind: 'select', ref: 'e1', values: [] },
      { kind: 'select', ref: 'e1', values: ['duplicate', 'duplicate'] },
      { amount: 'pixels', direction: 'down', kind: 'scroll' },
      { amount: 'page', direction: 'left', kind: 'scroll' },
      { condition: 'network-idle', kind: 'wait', timeoutMs: 1_000 },
      { condition: 'page-ready', kind: 'wait', timeoutMs: 0 },
      { condition: 'page-ready', kind: 'wait', text: 'x', timeoutMs: 1 },
      { condition: 'text-visible', kind: 'wait', timeoutMs: 1 },
      { condition: 'text-visible', kind: 'wait', text: '', timeoutMs: 1 },
      { condition: 'url-matches', kind: 'wait', text: '/jobs', timeoutMs: 1 },
      { condition: 'ref-visible', kind: 'wait', timeoutMs: 1 },
      { condition: 'ref-visible', kind: 'wait', ref: '#id', timeoutMs: 1 },
      { condition: 'url-changed', kind: 'wait', quietMs: 100, timeoutMs: 1 },
      { condition: 'dom-stable', kind: 'wait', quietMs: 10, timeoutMs: 1 },
      {
        condition: 'page-ready',
        kind: 'wait',
        timeoutMs: BROWSER_MAX_WAIT_TIMEOUT_MS + 1,
      },
      { kind: 'evaluate', script: 'document.body.innerHTML' },
    ]

    expect(rejectedActions.every(action => !browserActionSchema.safeParse(action).success)).toBe(true)
  })

  it('binds every action to one observation, document revision, page, and control epoch', () => {
    const context = {
      controlEpoch: 3,
      documentRevision: 2,
      observationId: OBSERVATION_ID,
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }

    expect(browserActParamsSchema.safeParse({
      ...context,
      action: { kind: 'click', ref: 'e1' },
      frameId: 'main-frame',
    }).success).toBe(true)
    const capabilityContext = {
      documentRevision: context.documentRevision,
      observationId: context.observationId,
      pageId: context.pageId,
    }
    expect(browserCapabilityActParamsSchema.safeParse({
      ...capabilityContext,
      action: { kind: 'click', ref: 'e1' },
      frameId: 'main-frame',
    }).success).toBe(true)
    expect(browserCapabilityActParamsSchema.safeParse({
      ...capabilityContext,
      action: { kind: 'click', ref: 'e1' },
      controlEpoch: 3,
      frameId: 'main-frame',
    }).success).toBe(false)
    expect(browserActParamsSchema.safeParse({
      ...context,
      action: { kind: 'navigate', url: 'https://example.com/next' },
    }).success).toBe(true)
    expect(browserActParamsSchema.safeParse({
      ...context,
      action: { key: 'Enter', kind: 'press' },
    }).success).toBe(true)

    const rejectedInputs = [
      {
        ...context,
        action: { kind: 'click', ref: 'e1' },
      },
      {
        ...context,
        action: { kind: 'navigate', url: 'https://example.com/next' },
        frameId: 'main-frame',
      },
      {
        ...context,
        action: { key: 'Enter', kind: 'press', ref: 'e1' },
      },
      {
        ...context,
        action: { kind: 'click', ref: 'e1' },
        frameId: 'main-frame',
        observationId: 'not-an-observation-id',
      },
      {
        ...context,
        action: { kind: 'click', ref: 'e1' },
        controlEpoch: -1,
        frameId: 'main-frame',
      },
    ]

    expect(rejectedInputs.every(input => !browserActParamsSchema.safeParse(input).success)).toBe(true)
  })

  it('defines strict page-bound control acquire, lease, and release contracts', () => {
    expect(browserAcquireControlParamsSchema.safeParse({
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }).success).toBe(true)
    expect(browserControlLeaseSchema.safeParse({
      controller: 'agent',
      controlEpoch: 1,
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }).success).toBe(true)
    expect(browserReleaseControlParamsSchema.safeParse({
      controlEpoch: 1,
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }).success).toBe(true)

    expect(browserAcquireControlParamsSchema.safeParse({
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
      takeover: true,
    }).success).toBe(false)
    expect(browserControlLeaseSchema.safeParse({
      controller: 'human',
      controlEpoch: 1,
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }).success).toBe(false)
    expect(browserControlLeaseSchema.safeParse({
      controller: 'agent',
      controlEpoch: 0,
      pageId: PAGE_ID,
      sessionId: SESSION_ID,
    }).success).toBe(false)
  })

  it('bounds semantic observations and rejects leaked redacted values', () => {
    expect(browserObservationSchema.safeParse(OBSERVATION).success).toBe(true)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...OBSERVATION.elements[1],
        value: 'not-allowed',
      }],
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...OBSERVATION.elements[1],
        value: 'not-empty',
        valueState: 'empty',
      }],
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...OBSERVATION.elements[1],
        valueState: 'present',
      }],
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: Array.from({ length: 401 }, (_, index) => ({
        actions: [],
        frameId: 'main-frame',
        name: `Node ${index + 1}`,
        ref: `e${index + 1}`,
        role: 'generic',
        states: [],
      })),
    }).success).toBe(false)
  })

  it('makes human-only input and filled state explicit without exposing its value', () => {
    const sensitiveElement = OBSERVATION.elements[1]
    expect(browserObservationSchema.safeParse(OBSERVATION).success).toBe(true)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...sensitiveElement,
        actions: ['fill'],
      }],
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...sensitiveElement,
        inputMode: undefined,
      }],
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      elements: [{
        ...sensitiveElement,
        valueState: 'empty',
      }],
    }).success).toBe(true)
  })

  it('binds truncated observations to bounded screenshot resource references', () => {
    const truncatedObservation = {
      ...OBSERVATION,
      screenshot: {
        byteLength: 128,
        height: 600,
        mimeType: 'image/png',
        reasons: ['semantic-content-truncated'],
        screenshotId: '7a2d7f0d-c0d0-4e95-a1ef-0a9f271b1f82',
        width: 800,
      },
      truncated: true,
      truncation: {
        reasons: ['element-limit'],
        suggestedMaxElements: 320,
      },
    }

    expect(browserObservationSchema.safeParse(truncatedObservation).success).toBe(true)
    expect(browserObservationSchema.safeParse({
      ...truncatedObservation,
      screenshot: {
        ...truncatedObservation.screenshot,
        data: 'iVBORw0KGgo=',
      },
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      truncated: true,
    }).success).toBe(false)
    expect(browserObservationSchema.safeParse({
      ...OBSERVATION,
      truncation: truncatedObservation.truncation,
    }).success).toBe(false)
  })

  it('rejects semantic observations whose complete UTF-8 JSON exceeds 32 KiB', () => {
    const oversizedObservation = {
      ...OBSERVATION,
      elements: Array.from({ length: 16 }, (_, index) => ({
        actions: [],
        frameId: 'main-frame',
        name: '界'.repeat(1_024),
        ref: `e${index + 1}`,
        role: 'text',
        states: [],
      })),
    }

    expect(serializedByteLength(oversizedObservation)).toBeGreaterThan(32 * 1_024)
    expect(browserObservationSchema.safeParse(oversizedObservation).success).toBe(false)
  })
})

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}
