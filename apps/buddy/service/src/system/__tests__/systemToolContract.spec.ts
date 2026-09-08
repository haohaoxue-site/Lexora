import { Check } from 'typebox/value'
import { describe, expect, it } from 'vitest'
import { systemActionInputSchema } from '../systemToolContract'

describe('system action service selector protocol', () => {
  it('rejects invalid service identifiers', () => {
    for (const selector of [
      { scope: 'system', serviceId: '' },
      { scope: 'system', serviceId: 'a'.repeat(257) },
      { scope: 'user', unit: 'buddy-fixture.service' },
      { scope: 'invalid', serviceId: 'BuddyFixture' },
    ]) {
      expect(Check(systemActionInputSchema, {
        action: 'restart-service',
        reason: 'Restart the isolated test service',
        target: { kind: 'service', ...selector },
      })).toBe(false)
    }
  })
})
