import { z } from 'zod'
import { readLocalChatErrorCode } from '../runtime/localChatError'

export const APPLICATION_DIAGNOSTIC_METHOD = 'application.diagnostic'
export const diagnosticIdentitySchema = z.string().regex(/^\w[\w:.-]{0,191}$/)
export const diagnosticCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,95}$/)

export const applicationDiagnosticSchema = z.object({
  event: z.string().regex(/^[a-z][a-z\d._-]{0,95}$/),
  component: z.string().regex(/^[a-z][a-z\d._-]{0,95}$/).optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  operationId: diagnosticIdentitySchema.optional(),
  parentOperationId: diagnosticIdentitySchema.optional(),
  generation: diagnosticIdentitySchema.optional(),
  sessionId: diagnosticIdentitySchema.optional(),
  providerId: diagnosticIdentitySchema.optional(),
  connectorId: diagnosticIdentitySchema.optional(),
  automationId: diagnosticIdentitySchema.optional(),
  occurrenceId: diagnosticIdentitySchema.optional(),
  toolCallId: diagnosticIdentitySchema.optional(),
  conversationId: diagnosticIdentitySchema.optional(),
  branchId: diagnosticIdentitySchema.optional(),
  runId: diagnosticIdentitySchema.optional(),
  turnId: diagnosticIdentitySchema.optional(),
  requestId: diagnosticIdentitySchema.optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  errorCode: diagnosticCodeSchema.optional(),
  errorType: z.string().regex(/^[a-z]\w{0,95}$/i).optional(),
  count: z.number().int().nonnegative().optional(),
  attempt: z.number().int().nonnegative().optional(),
  method: z.string().regex(/^[a-z][a-z\d.]{0,95}$/i).optional(),
  sourceSequence: z.number().int().positive().optional(),
  occurredAt: z.iso.datetime().optional(),
}).strict()

export type ApplicationDiagnostic = z.infer<typeof applicationDiagnosticSchema>
export type ApplicationDiagnosticReporter = (event: ApplicationDiagnostic) => void

export function safeDiagnosticReporter(report?: ApplicationDiagnosticReporter): ApplicationDiagnosticReporter {
  return (event) => {
    try {
      report?.(event)
    }
    catch {}
  }
}

export function readDiagnosticErrorCode(error: unknown): string {
  const publicCode = readLocalChatErrorCode(error)
  if (publicCode)
    return publicCode
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : undefined
    if (typeof code === 'string' && ['INITIAL_STATE_UNAVAILABLE', 'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EIO', 'EMFILE', 'ERR_SQLITE_ERROR'].includes(code))
      return code
  }
  return 'OPERATION_FAILED'
}
