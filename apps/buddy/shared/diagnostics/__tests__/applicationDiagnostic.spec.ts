import { describe, expect, it } from 'vitest'
import { applicationDiagnosticSchema, readDiagnosticError } from '../applicationDiagnostic'

describe('safe diagnostic errors', () => {
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
