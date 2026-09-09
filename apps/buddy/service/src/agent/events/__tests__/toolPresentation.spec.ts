import { describe, expect, it } from 'vitest'

import {
  createBuddyToolPresentation,
} from '../toolPresentation'

describe('createBuddyToolPresentation', () => {
  it('projects an expired internal action binding as recoverable without exposing internals', () => {
    const failure = {
      error: {
        code: 'SYSTEM_ACTION_EXPIRED',
        recoverable: true,
        recovery: {
          instruction: 'Retry lexora_system_action so Lexora Buddy can resolve and approve the current target again.',
          toolName: 'lexora_system_action',
        },
      },
    }
    const presentation = createBuddyToolPresentation({
      arguments: {
        action: 'terminate-process',
        reason: 'Finish the disposable expiry target',
        target: {
          kind: 'process',
          pid: 432_101,
        },
      },
      isError: true,
      result: {
        content: [{ type: 'text', text: JSON.stringify(failure) }],
        details: {},
      },
      toolName: 'lexora_system_action',
    })

    expect(presentation).toMatchObject({
      action: 'terminate-process',
      card: 'system',
      output: null,
      status: 'action-expired',
      target: null,
      verified: null,
    })
    expect(JSON.stringify(presentation)).not.toContain('startTicks')
    expect(JSON.stringify(presentation)).not.toContain('executable')
  })
})
