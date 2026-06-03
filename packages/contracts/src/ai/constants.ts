export const AI_PROVIDER_SCOPE = {
  PLATFORM: 'platform',
  USER: 'user',
} as const

export const AI_PROVIDER_SCOPE_VALUES = [
  AI_PROVIDER_SCOPE.PLATFORM,
  AI_PROVIDER_SCOPE.USER,
] as const

export const AI_PROVIDER_ENDPOINT_MODE = {
  FIXED: 'fixed',
  CUSTOM: 'custom',
} as const

export const AI_PROVIDER_ENDPOINT_MODE_VALUES = [
  AI_PROVIDER_ENDPOINT_MODE.FIXED,
  AI_PROVIDER_ENDPOINT_MODE.CUSTOM,
] as const

export const AI_PROVIDER_AUTH_MODE = {
  API_KEY: 'api-key',
  BEARER: 'bearer',
  NONE: 'none',
} as const

export const AI_PROVIDER_AUTH_MODE_VALUES = [
  AI_PROVIDER_AUTH_MODE.API_KEY,
  AI_PROVIDER_AUTH_MODE.BEARER,
  AI_PROVIDER_AUTH_MODE.NONE,
] as const

export const AI_MODEL_TYPE = {
  CHAT: 'chat',
  EMBEDDING: 'embedding',
  RERANK: 'rerank',
  IMAGE: 'image',
} as const

export const AI_MODEL_TYPE_VALUES = [
  AI_MODEL_TYPE.CHAT,
  AI_MODEL_TYPE.EMBEDDING,
  AI_MODEL_TYPE.RERANK,
  AI_MODEL_TYPE.IMAGE,
] as const

export const AI_MODEL_CAPABILITY = {
  STREAMING: 'streaming',
  VISION: 'vision',
  TOOL_CALL: 'tool_call',
  REASONING: 'reasoning',
  JSON_MODE: 'json_mode',
} as const

export const AI_MODEL_CAPABILITY_VALUES = [
  AI_MODEL_CAPABILITY.STREAMING,
  AI_MODEL_CAPABILITY.VISION,
  AI_MODEL_CAPABILITY.TOOL_CALL,
  AI_MODEL_CAPABILITY.REASONING,
  AI_MODEL_CAPABILITY.JSON_MODE,
] as const

export const AI_MODEL_INTENT_KEY = {
  CHAT_DEFAULT: 'chat.default',
  CHAT_ASSISTANT_DEFAULT: 'chat.assistant.default',
  DOCUMENT_DEFAULT: 'document.default',
  DOCUMENT_GENERATE_DEFAULT: 'document.generate.default',
  DOCUMENT_REWRITE_DEFAULT: 'document.rewrite.default',
} as const

export const AI_MODEL_INTENT_KEY_VALUES = [
  AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
  AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
  AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
  AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT,
  AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT,
] as const

type AiModelIntentKeyValue = typeof AI_MODEL_INTENT_KEY_VALUES[number]

interface AiModelIntentDefinition {
  parentKey: AiModelIntentKeyValue | null
}

export const AI_MODEL_INTENT_DEFINITIONS = {
  [AI_MODEL_INTENT_KEY.CHAT_DEFAULT]: {
    parentKey: null,
  },
  [AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT]: {
    parentKey: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
  },
  [AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT]: {
    parentKey: null,
  },
  [AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT]: {
    parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
  },
  [AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT]: {
    parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
  },
} as const satisfies Record<AiModelIntentKeyValue, AiModelIntentDefinition>

export const AI_EDITOR_WORKFLOW_KEY = {
  GENERATE: 'editor.generate',
  REWRITE: 'editor.rewrite',
} as const

export const AI_EDITOR_WORKFLOW_KEY_VALUES = [
  AI_EDITOR_WORKFLOW_KEY.GENERATE,
  AI_EDITOR_WORKFLOW_KEY.REWRITE,
] as const

export const AI_EDITOR_FIELD = {
  BODY: 'body',
} as const

export const AI_EDITOR_FIELD_VALUES = [
  AI_EDITOR_FIELD.BODY,
] as const

export const AI_ANCHOR_KIND = {
  BLOCK_INSERT: 'block-insert',
  TEXT_SELECTION: 'text-selection',
} as const

export const AI_ANCHOR_KIND_VALUES = [
  AI_ANCHOR_KIND.BLOCK_INSERT,
  AI_ANCHOR_KIND.TEXT_SELECTION,
] as const

export const AI_SESSION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  READY: 'ready',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  FAILED: 'failed',
} as const

export const AI_SESSION_STATUS_VALUES = [
  AI_SESSION_STATUS.PENDING,
  AI_SESSION_STATUS.RUNNING,
  AI_SESSION_STATUS.READY,
  AI_SESSION_STATUS.ACCEPTED,
  AI_SESSION_STATUS.REJECTED,
  AI_SESSION_STATUS.FAILED,
] as const

export const AI_RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export const AI_RUN_STATUS_VALUES = [
  AI_RUN_STATUS.PENDING,
  AI_RUN_STATUS.RUNNING,
  AI_RUN_STATUS.COMPLETED,
  AI_RUN_STATUS.FAILED,
] as const

export const AI_CANDIDATE_STATUS = {
  COMPLETED: 'completed',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const

export const AI_CANDIDATE_STATUS_VALUES = [
  AI_CANDIDATE_STATUS.COMPLETED,
  AI_CANDIDATE_STATUS.ACCEPTED,
  AI_CANDIDATE_STATUS.REJECTED,
] as const

export const AI_EDITOR_STREAM_EVENT_TYPE = {
  SESSION_CREATED: 'session.created',
  TEXT_DELTA: 'text.delta',
  CANDIDATE_COMPLETED: 'candidate.completed',
  ERROR: 'error',
} as const

export const AI_EDITOR_STREAM_EVENT_TYPE_VALUES = [
  AI_EDITOR_STREAM_EVENT_TYPE.SESSION_CREATED,
  AI_EDITOR_STREAM_EVENT_TYPE.TEXT_DELTA,
  AI_EDITOR_STREAM_EVENT_TYPE.CANDIDATE_COMPLETED,
  AI_EDITOR_STREAM_EVENT_TYPE.ERROR,
] as const

export const AI_PROVIDER_CREDENTIAL_STATUS = {
  MISSING: 'missing',
  CONFIGURED: 'configured',
} as const

export const AI_PROVIDER_CREDENTIAL_STATUS_VALUES = [
  AI_PROVIDER_CREDENTIAL_STATUS.MISSING,
  AI_PROVIDER_CREDENTIAL_STATUS.CONFIGURED,
] as const

export const AI_PROVIDER_SOURCE = {
  PRESET: 'preset',
  COMPATIBLE: 'compatible',
} as const

export const AI_PROVIDER_SOURCE_VALUES = [
  AI_PROVIDER_SOURCE.PRESET,
  AI_PROVIDER_SOURCE.COMPATIBLE,
] as const

export const AI_DEFAULT_MODEL_STATUS = {
  NOT_CONFIGURED: 'not_configured',
  READY: 'ready',
  INVALID: 'invalid',
} as const

export const AI_DEFAULT_MODEL_STATUS_VALUES = [
  AI_DEFAULT_MODEL_STATUS.NOT_CONFIGURED,
  AI_DEFAULT_MODEL_STATUS.READY,
  AI_DEFAULT_MODEL_STATUS.INVALID,
] as const
