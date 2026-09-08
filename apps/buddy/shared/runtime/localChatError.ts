export type LocalChatErrorCode
  = | 'APPROVAL_REQUIRED'
    | 'ATTACHMENT_LIMIT_EXCEEDED'
    | 'AUTOMATION_CONFLICT'
    | 'AUTOMATION_INVALID_SCHEDULE'
    | 'AUTOMATION_NOT_FOUND'
    | 'AUTHENTICATION_REQUIRED'
    | 'CONNECTOR_UNAVAILABLE'
    | 'CREDENTIAL_STORE_UNAVAILABLE'
    | 'DIRECTORY_NOT_AUTHORIZED'
    | 'DRAFT_CONFLICT'
    | 'LOCAL_CHAT_OPERATION_FAILED'
    | 'MODEL_SYNC_FAILED'
    | 'MODEL_SYNC_UNSUPPORTED'
    | 'MODEL_INPUT_UNSUPPORTED'
    | 'PATH_OUTSIDE_GRANTED_DIRECTORY'
    | 'SPACE_HAS_ACTIVE_RUNS'
    | 'SPACE_UNAVAILABLE'
    | 'PROVIDER_HAS_ACTIVE_RUNS'
    | 'PROVIDER_LOGIN_CANCELLED'
    | 'PROVIDER_UNAVAILABLE'
    | 'RUNTIME_PROTOCOL_ERROR'
    | 'RUNTIME_UNAVAILABLE'
    | 'VALIDATION_FAILED'

export interface LocalChatPublicError {
  code: LocalChatErrorCode
  retryable: boolean
}

const LOCAL_CHAT_ERROR_MARKER = 'LEXORA_LOCAL_CHAT_ERROR'

const LOCAL_CHAT_ERROR_PATTERN = /LEXORA_LOCAL_CHAT_ERROR:([A-Z0-9_]+):(0|1)/

const LOCAL_CHAT_ERROR_CODES = new Set<LocalChatErrorCode>([
  'APPROVAL_REQUIRED',
  'ATTACHMENT_LIMIT_EXCEEDED',
  'AUTOMATION_CONFLICT',
  'AUTOMATION_INVALID_SCHEDULE',
  'AUTOMATION_NOT_FOUND',
  'AUTHENTICATION_REQUIRED',
  'CONNECTOR_UNAVAILABLE',
  'CREDENTIAL_STORE_UNAVAILABLE',
  'DIRECTORY_NOT_AUTHORIZED',
  'DRAFT_CONFLICT',
  'LOCAL_CHAT_OPERATION_FAILED',
  'MODEL_SYNC_FAILED',
  'MODEL_SYNC_UNSUPPORTED',
  'MODEL_INPUT_UNSUPPORTED',
  'PATH_OUTSIDE_GRANTED_DIRECTORY',
  'SPACE_HAS_ACTIVE_RUNS',
  'SPACE_UNAVAILABLE',
  'PROVIDER_HAS_ACTIVE_RUNS',
  'PROVIDER_LOGIN_CANCELLED',
  'PROVIDER_UNAVAILABLE',
  'RUNTIME_PROTOCOL_ERROR',
  'RUNTIME_UNAVAILABLE',
  'VALIDATION_FAILED',
])

export function formatLocalChatPublicError(error: LocalChatPublicError): string {
  return `${LOCAL_CHAT_ERROR_MARKER}:${error.code}:${error.retryable ? '1' : '0'}`
}

export function parseLocalChatPublicError(message: string): LocalChatPublicError | null {
  const match = LOCAL_CHAT_ERROR_PATTERN.exec(message)
  if (!match || !isLocalChatErrorCode(match[1]))
    return null
  return { code: match[1], retryable: match[2] === '1' }
}

export function isLocalChatErrorCode(value: string | undefined): value is LocalChatErrorCode {
  return Boolean(value && LOCAL_CHAT_ERROR_CODES.has(value as LocalChatErrorCode))
}
