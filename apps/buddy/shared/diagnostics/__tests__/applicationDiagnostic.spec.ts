import { describe, expect, it } from 'vitest'
import { applicationDiagnosticSchema, readDiagnosticError } from '../applicationDiagnostic'

describe('safe diagnostic errors', () => {
  it('preserves bounded ACL evidence but rejects identities, paths and arbitrary failure details', () => {
    const acl = { reason: 'untrusted_access', aceIndex: 3, aceType: 0, aceFlags: 19, accessMask: 0xFFFFFFFF, principal: 'other' }
    const failure = { kind: 'private_directories', operation: 'validate_acl', acl }
    const diagnostic = { event: 'startup.step.failed', level: 'error', failure }
    expect(applicationDiagnosticSchema.parse(diagnostic).failure).toEqual(failure)
    for (const extra of [{ sid: 'S-1-5-21-1-2-3-1001' }, { path: 'fixture-private-path' }, { accessMask: 0x100000000 }, { aceFlags: 256 }, { principal: 'fixture-private-user' }])
      expect(applicationDiagnosticSchema.safeParse({ ...diagnostic, failure: { ...failure, acl: { ...acl, ...extra } } }).success).toBe(false)
  })

  it('retains a native failure through an error cause without copying private text', () => {
    const failure = { kind: 'private_directories', operation: 'validate_acl', directoryIndex: 1 } as const
    const cause = Object.assign(new Error('fixture-private-path'), { code: 'PRIVATE_DIRECTORIES_UNSAFE', failure })
    const error = new Error('token=fixture-secret', { cause })
    expect(readDiagnosticError(error)).toEqual({ errorCode: cause.code, errorType: 'Error', failure })
  })

  it('rejects arbitrary nested details while retaining a safe failure code', () => {
    const failure = { kind: 'private_directories', operation: 'validate_acl', path: 'fixture-private-path' }
    const error = Object.assign(new Error('fixture-private-text'), { code: 'PRIVATE_DIRECTORIES_UNSAFE', failure })
    expect(readDiagnosticError(error)).toEqual({ errorCode: error.code, errorType: 'Error' })
    expect(applicationDiagnosticSchema.safeParse({ event: 'startup.step.failed', level: 'error', failure }).success).toBe(false)
  })

  it('bounds cyclic cause chains and unsupported error types', () => {
    const error = new Error('fixture-private-text')
    error.cause = error
    error.name = 'fixture private error type'
    expect(readDiagnosticError(error)).toEqual({ errorCode: 'OPERATION_FAILED', errorType: 'UnknownError' })
  })
})
