import { describe, expect, it } from 'vitest'

import { toPublicRunEvent } from '../../../../../shared/runs/publicRunEvent'
import {
  createPiEventProjectionState,
  projectPiEvent,
  projectToolExecutionAuthorized,
} from '../projectPiEvent'

const sessionId = '79b92aaf-e635-4dfe-837d-f4b7b102ada7'
const pageId = '818bb0b0-6f5b-4868-a04c-0fefef08f1f4'
const OBSERVATION_ID = '1e6679fe-dd15-43f8-9ca0-92f679be1adb'

describe('browser run event projection', () => {
  it('records a redacted URL summary without local paths or URL secrets', () => {
    const state = createPiEventProjectionState()
    const local = projectPiEvent({
      args: {
        entryPath: '/home/alice/private/dashboard.html',
        kind: 'local-file',
      },
      toolCallId: 'browser-local',
      toolName: 'lexora_browser_open',
      type: 'tool_execution_start',
    }, state).events[0]

    expect(local).toMatchObject({
      payload: {
        presentation: browserPresentation({ operation: 'open' }),
      },
      type: 'tool.preparing',
    })
    expect(JSON.stringify(local)).not.toContain('/home/alice/private')

    const remote = projectPiEvent({
      args: {
        kind: 'url',
        url: 'https://alice:password@example.test/accounts/42?token=private#billing',
      },
      toolCallId: 'browser-remote',
      toolName: 'lexora_browser_open',
      type: 'tool_execution_start',
    }, state).events[0]

    expect(remote).toMatchObject({
      payload: {
        presentation: browserPresentation({
          operation: 'open',
          origin: 'https://example.test',
          pathname: '/[redacted]',
        }),
      },
    })
    expect(JSON.stringify(remote)).not.toContain('alice')
    expect(JSON.stringify(remote)).not.toContain('password')
    expect(JSON.stringify(remote)).not.toContain('private')
    expect(JSON.stringify(remote)).not.toContain('billing')
  })

  it('persists only bounded observation metadata in durable and public events', () => {
    const state = createPiEventProjectionState()
    projectPiEvent({
      args: { maxElements: 40 },
      toolCallId: 'browser-observe',
      toolName: 'lexora_browser_snapshot',
      type: 'tool_execution_start',
    }, state)

    const completed = projectPiEvent({
      isError: false,
      result: {
        content: [{
          text: JSON.stringify({
            elements: [{
              frameId: 'private-frame',
              name: 'Payment card',
              ref: 'e1',
              role: 'textbox',
              value: '4111111111111111',
            }],
            screenshot: {
              screenshotId: 'e7b64f66-6b0e-4498-acab-ceb283df7ca0',
            },
          }),
          type: 'text',
        }],
        details: {
          documentRevision: 7,
          elementCount: 40,
          inputValue: '4111111111111111',
          observationId: '1e6679fe-dd15-43f8-9ca0-92f679be1adb',
          operation: 'snapshot',
          pageId,
          screenshot: {
            screenshotId: 'e7b64f66-6b0e-4498-acab-ceb283df7ca0',
          },
          sessionId,
          status: 'ready',
          truncated: true,
          url: 'file:///home/person/workspace/form.html?token=private#otp',
        },
      },
      toolCallId: 'browser-observe',
      toolName: 'lexora_browser_snapshot',
      type: 'tool_execution_end',
    }, state).events[0]!

    const presentation = browserPresentation({
      documentRevision: 7,
      elementCount: 40,
      observationTruncated: true,
      operation: 'snapshot',
      origin: 'file://',
      pageId,
      pageStatus: 'ready',
      pathname: '/[redacted]',
      sessionId,
      status: 'completed',
    })
    expect(completed).toEqual({
      payload: {
        isError: false,
        presentation,
        toolCallId: 'browser-observe',
        toolName: 'lexora_browser_snapshot',
      },
      type: 'tool.completed',
    })

    const publicEvent = toPublicRunEvent({
      createdAt: '2026-09-01T00:00:00.000Z',
      payload: completed.payload,
      runId: 'run-browser',
      sequence: 1,
      type: completed.type,
    })
    expect(publicEvent.payload).toEqual(completed.payload)

    const persisted = JSON.stringify([completed, publicEvent])
    expect(persisted).not.toContain('4111111111111111')
    expect(persisted).not.toContain('private-frame')
    expect(persisted).not.toContain('screenshotId')
    expect(persisted).not.toContain('observationId')
    expect(persisted).not.toContain('/home/person/workspace')
    expect(persisted).not.toContain('token=')
    expect(persisted).not.toContain('#otp')
  })

  it('records only a stable browser failure code', () => {
    const state = createPiEventProjectionState()
    projectPiEvent({
      args: {},
      toolCallId: 'browser-failure',
      toolName: 'lexora_browser_snapshot',
      type: 'tool_execution_start',
    }, state)

    const completed = projectPiEvent({
      isError: true,
      result: {
        content: [{
          text: JSON.stringify({
            code: 'BROWSER_TARGET_STALE',
            diagnostic: 'private Chromium failure',
            recovery: 'read_again',
          }),
          type: 'text',
        }],
        details: {
          code: 'BROWSER_TARGET_STALE',
          diagnostic: 'private Chromium failure',
          operation: 'snapshot',
          recovery: 'read_again',
        },
      },
      toolCallId: 'browser-failure',
      toolName: 'lexora_browser_snapshot',
      type: 'tool_execution_end',
    }, state).events[0]!

    expect(completed).toMatchObject({
      payload: {
        isError: true,
        presentation: browserPresentation({
          errorCode: 'BROWSER_TARGET_STALE',
          operation: 'snapshot',
          status: 'failed',
        }),
      },
      type: 'tool.completed',
    })
    expect(JSON.stringify(completed)).not.toContain('private Chromium failure')
    expect(JSON.stringify(completed)).not.toContain('read_again')
  })

  it('projects exact policy failure codes without trusting diagnostic tool output', () => {
    const exactState = createPiEventProjectionState()
    const args = {
      action: { kind: 'fill', ref: 'e7', text: 'private-password' },
      documentRevision: 11,
      frameId: 'private-frame',
      observationId: OBSERVATION_ID,
      pageId,
    }
    projectPiEvent({
      args,
      toolCallId: 'browser-sensitive',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_start',
    }, exactState)
    const exact = projectPiEvent({
      isError: true,
      result: {
        content: [{ text: 'BROWSER_HUMAN_INPUT_REQUIRED', type: 'text' }],
        details: {},
      },
      toolCallId: 'browser-sensitive',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_end',
    }, exactState).events[0]!

    expect(exact).toMatchObject({
      payload: {
        isError: true,
        presentation: browserPresentation({
          actionKind: 'fill',
          errorCode: 'BROWSER_HUMAN_INPUT_REQUIRED',
          fieldType: 'text',
          inputLength: 16,
          operation: 'act',
          status: 'failed',
        }),
      },
      type: 'tool.completed',
    })
    expect(toPublicRunEvent({
      createdAt: '2026-09-01T00:00:00.000Z',
      payload: exact.payload,
      runId: 'run-browser',
      sequence: 1,
      type: exact.type,
    }).payload).toEqual(exact.payload)

    const diagnosticState = createPiEventProjectionState()
    projectPiEvent({
      args,
      toolCallId: 'browser-diagnostic',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_start',
    }, diagnosticState)
    const diagnostic = projectPiEvent({
      isError: true,
      result: {
        content: [{
          text: 'BROWSER_HUMAN_INPUT_REQUIRED: leaked private-password',
          type: 'text',
        }],
        details: {},
      },
      toolCallId: 'browser-diagnostic',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_end',
    }, diagnosticState).events[0]!

    expect(diagnostic).toMatchObject({
      payload: {
        isError: true,
        presentation: browserPresentation({
          actionKind: 'fill',
          errorCode: 'BROWSER_CAPABILITY_FAILED',
          fieldType: 'text',
          inputLength: 16,
          operation: 'act',
          status: 'failed',
        }),
      },
    })
    expect(JSON.stringify(diagnostic)).not.toContain('private-password')
  })

  it('records only action kind, field type, and input length for browser input actions', () => {
    const state = createPiEventProjectionState()
    const secret = 'private search phrase'
    const args = {
      action: { kind: 'fill', ref: 'e7', text: secret },
      documentRevision: 11,
      frameId: 'private-frame',
      observationId: '1e6679fe-dd15-43f8-9ca0-92f679be1adb',
      pageId,
    }
    const preparing = projectPiEvent({
      args,
      toolCallId: 'browser-act',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_start',
    }, state).events[0]!
    const started = projectToolExecutionAuthorized({
      arguments: args,
      toolCallId: 'browser-act',
      toolName: 'lexora_browser_act',
    }, state).events[0]!
    const updated = projectPiEvent({
      args,
      partialResult: {
        content: [{ text: secret, type: 'text' }],
        details: { inputValue: secret, operation: 'act' },
      },
      toolCallId: 'browser-act',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_update',
    }, state).events[0]!
    const completed = projectPiEvent({
      isError: false,
      result: {
        content: [{ text: secret, type: 'text' }],
        details: {
          actionKind: 'fill',
          inputValue: secret,
          operation: 'act',
          pageId,
          sessionId,
          status: 'ready',
          url: 'https://example.test/search?q=private#results',
        },
      },
      toolCallId: 'browser-act',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_end',
    }, state).events[0]!

    const runningPresentation = browserPresentation({
      actionKind: 'fill',
      fieldType: 'text',
      inputLength: secret.length,
      operation: 'act',
    })
    expect(preparing).toMatchObject({ payload: { presentation: runningPresentation } })
    expect(started).toMatchObject({ payload: { presentation: runningPresentation } })
    expect(updated).toMatchObject({
      payload: {
        presentation: browserPresentation({
          actionKind: 'fill',
          fieldType: 'text',
          inputLength: secret.length,
          operation: 'act',
          status: 'completed',
        }),
      },
    })
    expect(completed).toMatchObject({
      payload: {
        presentation: browserPresentation({
          actionKind: 'fill',
          fieldType: 'text',
          inputLength: secret.length,
          operation: 'act',
          origin: 'https://example.test',
          pageId,
          pageStatus: 'ready',
          pathname: '/[redacted]',
          sessionId,
          status: 'completed',
        }),
      },
    })

    const publicEvents = [preparing, started, updated, completed].map((event, index) => (
      toPublicRunEvent({
        createdAt: '2026-09-01T00:00:00.000Z',
        payload: event.payload,
        runId: 'run-browser',
        sequence: index + 1,
        type: event.type,
      })
    ))
    const persisted = JSON.stringify([preparing, started, updated, completed, publicEvents])
    expect(persisted).not.toContain(secret)
    expect(persisted).not.toContain('private-frame')
    expect(persisted).not.toContain('observationId')
    expect(persisted).not.toContain('inputValue')
    expect(persisted).not.toContain('?q=')
    expect(persisted).not.toContain('#results')
  })

  it('redacts URL credentials, query, and fragment from navigate action events', () => {
    const state = createPiEventProjectionState()
    const event = projectPiEvent({
      args: {
        action: {
          kind: 'navigate',
          url: 'https://alice:password@example.test/private/path?token=secret#account',
        },
        documentRevision: 1,
        observationId: OBSERVATION_ID,
        pageId,
      },
      toolCallId: 'browser-act-navigate',
      toolName: 'lexora_browser_act',
      type: 'tool_execution_start',
    }, state).events[0]!

    expect(event).toMatchObject({
      payload: {
        presentation: browserPresentation({
          actionKind: 'navigate',
          operation: 'act',
          origin: 'https://example.test',
          pathname: '/[redacted]',
        }),
      },
    })
    const persisted = JSON.stringify(event)
    expect(persisted).not.toContain('alice')
    expect(persisted).not.toContain('password')
    expect(persisted).not.toContain('private/path')
    expect(persisted).not.toContain('token=')
    expect(persisted).not.toContain('#account')
  })
})

function browserPresentation(overrides: Record<string, unknown>) {
  return {
    actionKind: null,
    card: 'browser',
    description: null,
    documentRevision: null,
    elementCount: null,
    errorCode: null,
    fieldType: null,
    inputLength: null,
    observationTruncated: null,
    operation: 'snapshot',
    origin: null,
    output: null,
    pageId: null,
    pageStatus: null,
    pathname: null,
    sessionId: null,
    status: 'running',
    truncated: false,
    ...overrides,
  }
}
