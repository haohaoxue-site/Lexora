import { z } from 'zod'
import {
  AI_ANCHOR_KIND,
  AI_ANCHOR_KIND_VALUES,
  AI_CANDIDATE_STATUS_VALUES,
  AI_DEFAULT_MODEL_STATUS_VALUES,
  AI_EDITOR_FIELD_VALUES,
  AI_EDITOR_STREAM_EVENT_TYPE,
  AI_EDITOR_STREAM_EVENT_TYPE_VALUES,
  AI_EDITOR_WORKFLOW_KEY,
  AI_EDITOR_WORKFLOW_KEY_VALUES,
  AI_MODEL_CAPABILITY_VALUES,
  AI_MODEL_INTENT_KEY_VALUES,
  AI_MODEL_TYPE_VALUES,
  AI_PROVIDER_AUTH_MODE_VALUES,
  AI_PROVIDER_CREDENTIAL_STATUS_VALUES,
  AI_PROVIDER_ENDPOINT_MODE_VALUES,
  AI_PROVIDER_SCOPE_VALUES,
  AI_PROVIDER_SOURCE_VALUES,
  AI_RUN_STATUS_VALUES,
  AI_SESSION_STATUS_VALUES,
} from './ai/constants'

export {
  AI_ANCHOR_KIND,
  AI_ANCHOR_KIND_VALUES,
  AI_CANDIDATE_STATUS,
  AI_CANDIDATE_STATUS_VALUES,
  AI_DEFAULT_MODEL_STATUS,
  AI_DEFAULT_MODEL_STATUS_VALUES,
  AI_EDITOR_FIELD,
  AI_EDITOR_FIELD_VALUES,
  AI_EDITOR_STREAM_EVENT_TYPE,
  AI_EDITOR_STREAM_EVENT_TYPE_VALUES,
  AI_EDITOR_WORKFLOW_KEY,
  AI_EDITOR_WORKFLOW_KEY_VALUES,
  AI_MODEL_CAPABILITY,
  AI_MODEL_CAPABILITY_VALUES,
  AI_MODEL_INTENT_DEFINITIONS,
  AI_MODEL_INTENT_KEY,
  AI_MODEL_INTENT_KEY_VALUES,
  AI_MODEL_TYPE,
  AI_MODEL_TYPE_VALUES,
  AI_PROVIDER_AUTH_MODE,
  AI_PROVIDER_AUTH_MODE_VALUES,
  AI_PROVIDER_CREDENTIAL_STATUS,
  AI_PROVIDER_CREDENTIAL_STATUS_VALUES,
  AI_PROVIDER_ENDPOINT_MODE,
  AI_PROVIDER_ENDPOINT_MODE_VALUES,
  AI_PROVIDER_SCOPE,
  AI_PROVIDER_SCOPE_VALUES,
  AI_PROVIDER_SOURCE,
  AI_PROVIDER_SOURCE_VALUES,
  AI_RUN_STATUS,
  AI_RUN_STATUS_VALUES,
  AI_SESSION_STATUS,
  AI_SESSION_STATUS_VALUES,
} from './ai/constants'

export const AiProviderScopeSchema = z.enum(AI_PROVIDER_SCOPE_VALUES)
export const AiProviderEndpointModeSchema = z.enum(AI_PROVIDER_ENDPOINT_MODE_VALUES)
export const AiProviderAuthModeSchema = z.enum(AI_PROVIDER_AUTH_MODE_VALUES)
export const AiProviderSourceSchema = z.enum(AI_PROVIDER_SOURCE_VALUES)
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
export const AiProviderCredentialStatusSchema = z.enum(AI_PROVIDER_CREDENTIAL_STATUS_VALUES)
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
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
  providerKey: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
}).strict()

export const AiProviderPresetSchema = z.object({
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpointMode: AiProviderEndpointModeSchema,
  authMode: AiProviderAuthModeSchema,
  supportedModelTypes: z.array(AiModelTypeSchema),
  fixedEndpoint: z.string().trim().url().nullable().optional(),
}).strict()

export const AiProviderPresetsResponseSchema = z.object({
  presets: z.array(AiProviderPresetSchema),
}).strict()

export const AiProviderSchema = z.object({
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
  source: AiProviderSourceSchema,
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpointMode: AiProviderEndpointModeSchema,
  authMode: AiProviderAuthModeSchema,
  endpointEditable: z.boolean(),
  nameEditable: z.boolean(),
  deletable: z.boolean(),
  endpoint: z.string().trim().min(1).nullable(),
  credentialStatus: AiProviderCredentialStatusSchema,
  enabled: z.boolean(),
  modelCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const AiProviderCredentialSchema = z.object({
  apiKey: z.string().nullable(),
}).strict()

export const AiProviderModelItemSchema = z.object({
  providerId: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
  modelName: NonEmptyStringSchema,
  modelType: AiModelTypeSchema,
  capabilities: z.array(AiModelCapabilitySchema),
  contextWindow: OptionalLimitSchema,
  maxOutputTokens: OptionalLimitSchema,
  enabled: z.boolean().optional(),
  updatedAt: IsoDateTimeStringSchema.optional(),
}).strict()

export const AiProviderModelsSchema = z.object({
  models: z.array(AiProviderModelItemSchema),
}).strict()

export const AiAvailableModelOptionSchema = z.object({
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
  providerKey: NonEmptyStringSchema,
  providerName: NonEmptyStringSchema,
  modelId: NonEmptyStringSchema,
  modelName: NonEmptyStringSchema,
  modelType: AiModelTypeSchema,
  capabilities: z.array(AiModelCapabilitySchema),
  selectable: z.boolean(),
  unavailableReason: z.string().trim().min(1).nullable(),
}).strict()

export const AiAvailableProviderOptionSchema = z.object({
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
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
    providerId: true,
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
    providerId: true,
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

export type AiProviderScope = z.infer<typeof AiProviderScopeSchema>
export type AiProviderEndpointMode = z.infer<typeof AiProviderEndpointModeSchema>
export type AiProviderAuthMode = z.infer<typeof AiProviderAuthModeSchema>
export type AiProviderSource = z.infer<typeof AiProviderSourceSchema>
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
export type AiProviderPreset = z.infer<typeof AiProviderPresetSchema>
export type AiProvider = z.infer<typeof AiProviderSchema>
export type AiProviderCredential = z.infer<typeof AiProviderCredentialSchema>
export type AiProviderModelItem = z.infer<typeof AiProviderModelItemSchema>
export type AiProviderModels = z.infer<typeof AiProviderModelsSchema>
export type AiAvailableModelOption = z.infer<typeof AiAvailableModelOptionSchema>
export type AiAvailableProviderOption = z.infer<typeof AiAvailableProviderOptionSchema>
export type AiDefaultModelPolicyItem = z.infer<typeof AiDefaultModelPolicyItemSchema>
export type UpdateAiDefaultModelPolicyRequest = z.infer<typeof UpdateAiDefaultModelPolicyRequestSchema>
export type AiSession = z.infer<typeof AiSessionSchema>
export type AiRun = z.infer<typeof AiRunSchema>
export type AiCandidate = z.infer<typeof AiCandidateSchema>
export type CreateAiEditorSessionRequest = z.infer<typeof CreateAiEditorSessionRequestSchema>
export type CreateAiEditorSessionResponse = z.infer<typeof CreateAiEditorSessionResponseSchema>
export type ResolveAiEditorCandidateResponse = z.infer<typeof ResolveAiEditorCandidateResponseSchema>
export type AiEditorStreamEvent = z.infer<typeof AiEditorStreamEventSchema>
