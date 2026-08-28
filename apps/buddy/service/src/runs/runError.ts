export const STABLE_RUN_ERROR_CODES = [
  'AGENT_RUN_FAILED',
  'AUTHENTICATION_REQUIRED',
  'AUTOMATION_RUN_TIMEOUT',
  'BUDDY_EXTENSION_LOAD_FAILED',
  'COMPACTION_FAILED',
  'CONTEXT_COMPACTION_NOT_NEEDED',
  'DIRECTORY_NOT_AUTHORIZED',
  'PATH_OUTSIDE_GRANTED_DIRECTORY',
  'PROVIDER_UNAVAILABLE',
  'SESSION_BINDING_INVALID',
  'SESSION_BINDING_MISMATCH',
  'SESSION_STORAGE_UNAVAILABLE',
  'UNTRUSTED_EXTENSION_LOADED',
] as const

export type StableRunErrorCode = typeof STABLE_RUN_ERROR_CODES[number]

export type BuddyAgentRunErrorCode
  = | StableRunErrorCode
    | 'CONVERSATION_BINDING_MISMATCH'
    | 'RUN_INPUT_NOT_FOUND'
    | 'RUN_NOT_FOUND'
    | 'RUN_STATE_MISMATCH'
    | 'VALIDATION_FAILED'

const STABLE_RUN_ERROR_CODE_SET: ReadonlySet<string> = new Set(STABLE_RUN_ERROR_CODES)

export class BuddyAgentRunError extends Error {
  readonly code: BuddyAgentRunErrorCode

  constructor(code: BuddyAgentRunErrorCode) {
    super('Lexora Buddy could not complete the requested run')
    this.name = 'BuddyAgentRunError'
    this.code = code
  }
}

export function isStableRunErrorCode(value: unknown): value is StableRunErrorCode {
  return typeof value === 'string' && STABLE_RUN_ERROR_CODE_SET.has(value)
}

export function readStableRunErrorCode(error: unknown): StableRunErrorCode {
  if (!error || typeof error !== 'object' || !('code' in error))
    return 'AGENT_RUN_FAILED'
  const code = (error as { code?: unknown }).code
  return isStableRunErrorCode(code)
    ? code
    : 'AGENT_RUN_FAILED'
}
