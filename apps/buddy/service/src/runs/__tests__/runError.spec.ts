import { describe, expect, it } from 'vitest'
import {
  BuddyAgentRunError,
  readStableRunErrorCode,
} from '../runError'

describe('runError', () => {
  it('does not expose internal or arbitrary exception codes', () => {
    expect(readStableRunErrorCode(new BuddyAgentRunError('RUN_NOT_FOUND')))
      .toBe('AGENT_RUN_FAILED')
    expect(readStableRunErrorCode({ code: 'ECONNRESET' })).toBe('AGENT_RUN_FAILED')
    expect(readStableRunErrorCode({ code: 500 })).toBe('AGENT_RUN_FAILED')
    expect(readStableRunErrorCode(new Error('failed'))).toBe('AGENT_RUN_FAILED')
  })
})
