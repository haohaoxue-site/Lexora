import { z } from 'zod'

export const AI_MODEL_SERVICE_SCOPE = {
  SYSTEM: 'system',
  USER: 'user',
} as const

export const AI_MODEL_SERVICE_SCOPE_VALUES = [
  AI_MODEL_SERVICE_SCOPE.SYSTEM,
  AI_MODEL_SERVICE_SCOPE.USER,
] as const

export const AI_MODEL_ENDPOINT_MODE = {
  FIXED: 'fixed',
  CUSTOM: 'custom',
} as const

export const AI_MODEL_ENDPOINT_MODE_VALUES = [
  AI_MODEL_ENDPOINT_MODE.FIXED,
  AI_MODEL_ENDPOINT_MODE.CUSTOM,
] as const

export const AI_MODEL_AUTH_MODE = {
  API_KEY: 'api-key',
  BEARER: 'bearer',
  NONE: 'none',
} as const

export const AI_MODEL_AUTH_MODE_VALUES = [
  AI_MODEL_AUTH_MODE.API_KEY,
  AI_MODEL_AUTH_MODE.BEARER,
  AI_MODEL_AUTH_MODE.NONE,
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

export const AI_MODEL_SERVICE_STATUS = {
  MISSING: 'missing',
  CONFIGURED: 'configured',
} as const

export const AI_MODEL_SERVICE_STATUS_VALUES = [
  AI_MODEL_SERVICE_STATUS.MISSING,
  AI_MODEL_SERVICE_STATUS.CONFIGURED,
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

export const AiModelServiceScopeSchema = z.enum(AI_MODEL_SERVICE_SCOPE_VALUES)
export const AiModelEndpointModeSchema = z.enum(AI_MODEL_ENDPOINT_MODE_VALUES)
export const AiModelAuthModeSchema = z.enum(AI_MODEL_AUTH_MODE_VALUES)
export const AiModelTypeSchema = z.enum(AI_MODEL_TYPE_VALUES)
export const AiModelCapabilitySchema = z.enum(AI_MODEL_CAPABILITY_VALUES)
export const AiModelIntentKeySchema = z.enum(AI_MODEL_INTENT_KEY_VALUES)
export const AiEditorWorkflowKeySchema = z.enum(AI_EDITOR_WORKFLOW_KEY_VALUES)
export const AiEditorFieldSchema = z.enum(AI_EDITOR_FIELD_VALUES)
export const AiAnchorKindSchema = z.enum(AI_ANCHOR_KIND_VALUES)
export const AiSessionStatusSchema = z.enum(AI_SESSION_STATUS_VALUES)
export const AiRunStatusSchema = z.enum(AI_RUN_STATUS_VALUES)
export const AiCandidateStatusSchema = z.enum(AI_CANDIDATE_STATUS_VALUES)
export const AiEditorStreamEventTypeSchema = z.enum(AI_EDITOR_STREAM_EVENT_TYPE_VALUES)
export const AiModelCredentialStatusSchema = z.enum(AI_MODEL_SERVICE_STATUS_VALUES)
export const AiDefaultModelStatusSchema = z.enum(AI_DEFAULT_MODEL_STATUS_VALUES)

const IsoDateTimeStringSchema = z.string().datetime()
const NonEmptyStringSchema = z.string().trim().min(1)
const OptionalLimitSchema = z.number().int().positive().nullable()
const ProjectionRevisionSchema = z.number().int().nonnegative()
const AiAnchorBaseSchema = z.object({
  documentId: NonEmptyStringSchema,
  field: AiEditorFieldSchema,
}).strict()

export const AiBlockInsertAnchorSchema = AiAnchorBaseSchema.extend({
  kind: z.literal(AI_ANCHOR_KIND.BLOCK_INSERT),
  blockId: NonEmptyStringSchema,
}).strict()

export const AiTextSelectionAnchorSchema = AiAnchorBaseSchema.extend({
  kind: z.literal(AI_ANCHOR_KIND.TEXT_SELECTION),
  blockId: NonEmptyStringSchema,
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
  selectedText: NonEmptyStringSchema,
}).strict().superRefine((anchor, context) => {
  if (anchor.to <= anchor.from) {
    context.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'to must be greater than from',
    })
  }
})

export const AiAnchorSchema = z.discriminatedUnion('kind', [
  AiBlockInsertAnchorSchema,
  AiTextSelectionAnchorSchema,
])

export const AiModelRefSchema = z.object({
  configId: NonEmptyStringSchema,
  scope: AiModelServiceScopeSchema,
  providerKey: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
}).strict()

export const AiModelProviderTemplateSchema = z.object({
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpointMode: AiModelEndpointModeSchema,
  authMode: AiModelAuthModeSchema,
  supportedModelTypes: z.array(AiModelTypeSchema),
  fixedEndpoint: z.string().trim().url().nullable().optional(),
}).strict()

export const AiModelProviderTemplatesResponseSchema = z.object({
  templates: z.array(AiModelProviderTemplateSchema),
}).strict()

export const AiModelServiceConfigSummarySchema = z.object({
  configId: NonEmptyStringSchema,
  scope: AiModelServiceScopeSchema,
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpointMode: AiModelEndpointModeSchema,
  endpointEditable: z.boolean(),
  endpoint: z.string().trim().min(1).nullable(),
  credentialStatus: AiModelCredentialStatusSchema,
  enabled: z.boolean(),
  modelCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const AiModelItemSchema = z.object({
  modelItemId: NonEmptyStringSchema,
  configId: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
  modelName: NonEmptyStringSchema,
  modelType: AiModelTypeSchema,
  capabilities: z.array(AiModelCapabilitySchema),
  contextWindow: OptionalLimitSchema,
  maxOutputTokens: OptionalLimitSchema,
  enabled: z.boolean(),
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const AiModelSyncResultSchema = z.object({
  models: z.array(AiModelItemSchema),
}).strict()

export const AiAvailableModelOptionSchema = z.object({
  configId: NonEmptyStringSchema,
  scope: AiModelServiceScopeSchema,
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
  modelName: NonEmptyStringSchema,
  modelType: AiModelTypeSchema,
  capabilities: z.array(AiModelCapabilitySchema),
  selectable: z.boolean(),
  unavailableReason: z.string().trim().min(1).nullable(),
}).strict()

export const AiAvailableModelServiceOptionSchema = z.object({
  configId: NonEmptyStringSchema,
  scope: AiModelServiceScopeSchema,
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
}).strict()

export const AiDefaultModelPolicyItemSchema = z.object({
  intentKey: AiModelIntentKeySchema,
  modelRef: AiModelRefSchema.nullable(),
  status: AiDefaultModelStatusSchema,
  invalidReason: z.string().trim().min(1).nullable(),
  updatedAt: IsoDateTimeStringSchema.nullable(),
}).strict()

export const UpdateAiDefaultModelPolicyRequestSchema = z.object({
  modelRef: AiModelRefSchema.pick({
    configId: true,
    modelId: true,
  }).nullable(),
}).strict()

export const AiSessionSchema = z.object({
  sessionId: NonEmptyStringSchema,
  documentId: NonEmptyStringSchema,
  workflowKey: AiEditorWorkflowKeySchema,
  prompt: NonEmptyStringSchema,
  anchor: AiAnchorSchema,
  baseProjectionRevision: ProjectionRevisionSchema,
  status: AiSessionStatusSchema,
  currentRunId: NonEmptyStringSchema.nullable(),
  acceptedCandidateId: NonEmptyStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const AiRunSchema = z.object({
  runId: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  agentRunId: NonEmptyStringSchema,
  workflowKey: AiEditorWorkflowKeySchema,
  modelTargetSnapshot: z.record(z.string(), z.unknown()).nullable(),
  status: AiRunStatusSchema,
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const AiCandidateSchema = z.object({
  candidateId: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  contentText: NonEmptyStringSchema,
  plainText: z.string().nullable(),
  status: AiCandidateStatusSchema,
  acceptedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const CreateAiEditorSessionRequestSchema = z.object({
  workflowKey: AiEditorWorkflowKeySchema,
  anchor: AiAnchorSchema,
  prompt: NonEmptyStringSchema,
  requestedModelRef: AiModelRefSchema.pick({
    configId: true,
    modelId: true,
  }).nullable().optional(),
}).strict().superRefine((request, context) => {
  if (request.workflowKey === AI_EDITOR_WORKFLOW_KEY.GENERATE && request.anchor.kind !== AI_ANCHOR_KIND.BLOCK_INSERT) {
    context.addIssue({
      code: 'custom',
      path: ['anchor'],
      message: 'editor.generate requires block-insert anchor',
    })
  }

  if (request.workflowKey === AI_EDITOR_WORKFLOW_KEY.REWRITE && request.anchor.kind !== AI_ANCHOR_KIND.TEXT_SELECTION) {
    context.addIssue({
      code: 'custom',
      path: ['anchor'],
      message: 'editor.rewrite requires text-selection anchor',
    })
  }
})

export const CreateAiEditorSessionResponseSchema = z.object({
  session: AiSessionSchema,
  run: AiRunSchema,
}).strict()

export const ResolveAiEditorCandidateResponseSchema = z.object({
  session: AiSessionSchema,
  candidate: AiCandidateSchema,
}).strict()

export const AiEditorSessionCreatedStreamEventSchema = z.object({
  type: z.literal(AI_EDITOR_STREAM_EVENT_TYPE.SESSION_CREATED),
  session: AiSessionSchema,
  run: AiRunSchema,
}).strict()

export const AiEditorTextDeltaStreamEventSchema = z.object({
  type: z.literal(AI_EDITOR_STREAM_EVENT_TYPE.TEXT_DELTA),
  content: z.string(),
}).strict()

export const AiEditorCandidateCompletedStreamEventSchema = z.object({
  type: z.literal(AI_EDITOR_STREAM_EVENT_TYPE.CANDIDATE_COMPLETED),
  candidate: AiCandidateSchema,
}).strict()

export const AiEditorErrorStreamEventSchema = z.object({
  type: z.literal(AI_EDITOR_STREAM_EVENT_TYPE.ERROR),
  message: NonEmptyStringSchema,
}).strict()

export const AiEditorStreamEventSchema = z.discriminatedUnion('type', [
  AiEditorSessionCreatedStreamEventSchema,
  AiEditorTextDeltaStreamEventSchema,
  AiEditorCandidateCompletedStreamEventSchema,
  AiEditorErrorStreamEventSchema,
])

export type AiModelServiceScope = z.infer<typeof AiModelServiceScopeSchema>
export type AiModelEndpointMode = z.infer<typeof AiModelEndpointModeSchema>
export type AiModelAuthMode = z.infer<typeof AiModelAuthModeSchema>
export type AiModelType = z.infer<typeof AiModelTypeSchema>
export type AiModelCapability = z.infer<typeof AiModelCapabilitySchema>
export type AiModelIntentKey = z.infer<typeof AiModelIntentKeySchema>
export type AiEditorWorkflowKey = z.infer<typeof AiEditorWorkflowKeySchema>
export type AiEditorField = z.infer<typeof AiEditorFieldSchema>
export type AiAnchorKind = z.infer<typeof AiAnchorKindSchema>
export type AiSessionStatus = z.infer<typeof AiSessionStatusSchema>
export type AiRunStatus = z.infer<typeof AiRunStatusSchema>
export type AiCandidateStatus = z.infer<typeof AiCandidateStatusSchema>
export type AiEditorStreamEventType = z.infer<typeof AiEditorStreamEventTypeSchema>

export type AiBlockInsertAnchor = z.infer<typeof AiBlockInsertAnchorSchema>
export type AiTextSelectionAnchor = z.infer<typeof AiTextSelectionAnchorSchema>
export type AiAnchor = z.infer<typeof AiAnchorSchema>
export type AiModelRef = z.infer<typeof AiModelRefSchema>
export type AiModelProviderTemplate = z.infer<typeof AiModelProviderTemplateSchema>
export type AiModelServiceConfigSummary = z.infer<typeof AiModelServiceConfigSummarySchema>
export type AiModelItem = z.infer<typeof AiModelItemSchema>
export type AiModelSyncResult = z.infer<typeof AiModelSyncResultSchema>
export type AiAvailableModelOption = z.infer<typeof AiAvailableModelOptionSchema>
export type AiAvailableModelServiceOption = z.infer<typeof AiAvailableModelServiceOptionSchema>
export type AiDefaultModelPolicyItem = z.infer<typeof AiDefaultModelPolicyItemSchema>
export type UpdateAiDefaultModelPolicyRequest = z.infer<typeof UpdateAiDefaultModelPolicyRequestSchema>
export type AiSession = z.infer<typeof AiSessionSchema>
export type AiRun = z.infer<typeof AiRunSchema>
export type AiCandidate = z.infer<typeof AiCandidateSchema>
export type CreateAiEditorSessionRequest = z.infer<typeof CreateAiEditorSessionRequestSchema>
export type CreateAiEditorSessionResponse = z.infer<typeof CreateAiEditorSessionResponseSchema>
export type ResolveAiEditorCandidateResponse = z.infer<typeof ResolveAiEditorCandidateResponseSchema>
export type AiEditorStreamEvent = z.infer<typeof AiEditorStreamEventSchema>
