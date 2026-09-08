import { z } from 'zod'
import { BUDDY_APPROVAL_POLICIES } from '../../shared/approvalPolicy'
import {
  APPROVAL_REVIEW_KINDS,
  approvalReviewPayloadMatchesKind,
  approvalReviewPayloadSchema,
} from '../../shared/approvalReviewPayload'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from '../../shared/attachmentPolicy'
import {
  automationChangedNotificationSchema,
  automationMutationRequestSchemas,
  automationOccurrencePageSchema,
  automationOccurrenceSchema,
  automationPageSchema,
  automationPreviewRequestSchema,
  automationPreviewResultSchema,
  automationRequestSchemas,
  automationRunNowResultSchema,
  automationSchema,
} from '../../shared/automation'

import {
  buddyComposerDraftOpenSchema,
  buddyComposerDraftSaveSchema,
  buddyComposerDraftSchema,
  buddyComposerDraftSendSchema,
  buddyComposerDraftTargetSchema,
} from '../../shared/composerDraft'
import {
  buddyComposerResourceAcceptSchema,
  buddyComposerResourceCompleteSchema,
  buddyComposerResourceSchema,
  buddyComposerResourceTargetSchema,
  buddyComposerSourceListResponseSchema,
  buddyComposerSourceSelectSchema,
  buddyComposerSpaceFileSelectSchema,
} from '../../shared/composerResource'
import { BUDDY_EXECUTION_PROFILES } from '../../shared/executionProfile'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
} from '../../shared/modelSelection'
import { isSecureOrLoopbackHttpUrl } from '../../shared/networkSecurity'
import { publicRunEventSchema } from '../../shared/publicRunEvent'
import { buddyServiceSupervisorFailureCodeSchema } from '../../shared/runtimeProtocol'

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const optionalLimitSchema = z.number().int().positive().max(500).optional()
const optionalEventLimitSchema = z.number().int().positive().max(1_000).optional()
const optionalCursorSchema = z.string().regex(/^[\w-]+$/).max(2_048).optional()
const timestampSchema = z.iso.datetime()
const nullableTimestampSchema = timestampSchema.nullable()
const executionProfileSchema = z.enum(BUDDY_EXECUTION_PROFILES)
const approvalPolicySchema = z.enum(BUDDY_APPROVAL_POLICIES)
const composerResourceIdsSchema = z.array(sessionIdentitySchema)
  .max(BUDDY_ATTACHMENT_COUNT_LIMIT)
  .refine(ids => new Set(ids).size === ids.length)

const runtimeStateSchema = z.object({
  lastError: buddyServiceSupervisorFailureCodeSchema.nullable(),
  pid: z.number().int().positive().nullable(),
  restartAttempt: z.number().int().nonnegative(),
  status: z.enum(['stopped', 'starting', 'ready', 'restarting', 'offline', 'stopping']),
}).strict()

const providerSchema = z.object({
  activeRunCount: z.number().int().nonnegative(),
  added: z.boolean(),
  api: z.string().nullable(),
  authTypes: z.array(z.enum(['api_key', 'oauth'])),
  baseUrl: z.string().nullable(),
  canSyncModels: z.boolean(),
  custom: z.boolean(),
  description: z.string().max(200).nullable(),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  enabledModelCount: z.number().int().nonnegative(),
  id: idSchema,
  modelCount: z.number().int().nonnegative(),
  setupComplete: z.boolean(),
  status: z.enum(['available', 'authentication_required', 'unavailable']),
  storedCredentialType: z.enum(['api_key', 'oauth']).nullable(),
  syncUnavailableReason: z.enum(['authentication_required', 'unsupported_api']).nullable(),
}).strict()

const modelSchema = z.object({
  available: z.boolean(),
  capabilities: z.array(z.string().min(1)),
  contextWindow: z.number().int().positive(),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  hasParameterOverride: z.boolean(),
  lastSeenAt: timestampSchema.nullable(),
  maxTokens: z.number().int().positive(),
  modelId: idSchema,
  overrideContextWindow: z.number().int().positive().nullable(),
  overrideMaxTokens: z.number().int().positive().nullable(),
  providerId: idSchema,
  reasoningOptions: z.array(z.enum(BUDDY_THINKING_LEVELS)),
  serviceTiers: z.array(z.object({
    displayName: z.string().min(1),
    id: z.enum(BUDDY_SERVICE_TIERS),
  }).strict()),
  source: z.enum(['builtin', 'manual', 'synced']),
  sourceContextWindow: z.number().int().positive(),
  sourceMaxTokens: z.number().int().positive(),
  sourceParametersUpdated: z.boolean(),
}).strict().superRefine((model, context) => {
  const hasOverridePair = model.overrideContextWindow !== null && model.overrideMaxTokens !== null
  const hasPartialOverride = (model.overrideContextWindow === null) !== (model.overrideMaxTokens === null)
  if (hasPartialOverride || model.hasParameterOverride !== hasOverridePair) {
    context.addIssue({
      code: 'custom',
      message: 'Model parameter overrides must be present as one atomic pair',
      path: ['hasParameterOverride'],
    })
  }
  if (model.sourceMaxTokens > model.sourceContextWindow) {
    context.addIssue({
      code: 'custom',
      message: 'Source max tokens cannot exceed the source context window',
      path: ['sourceMaxTokens'],
    })
  }
  const effectiveContextWindow = model.overrideContextWindow ?? model.sourceContextWindow
  const effectiveMaxTokens = model.overrideMaxTokens ?? model.sourceMaxTokens
  if (
    model.contextWindow !== effectiveContextWindow
    || model.maxTokens !== effectiveMaxTokens
    || effectiveMaxTokens > effectiveContextWindow
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Effective model parameters must match the override or source pair',
      path: ['contextWindow'],
    })
  }
})

const modelParametersOverrideSchema = z.object({
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
}).strict().refine(value => value.maxTokens <= value.contextWindow)

const notificationBaseShape = {
  attention: z.enum(['seen', 'unseen']),
  audience: z.literal('device'),
  id: idSchema,
  lifecycle: z.enum(['active', 'resolved']),
  occurredAt: timestampSchema,
  origin: z.literal('local-runtime'),
  resolvedAt: nullableTimestampSchema,
  revision: z.string().min(1),
}
const modelUpdateNotificationSchema = z.object({
  ...notificationBaseShape,
  action: z.object({ type: z.literal('open-model-settings') }).strict(),
  kind: z.literal('model.source-parameters-updated'),
  payload: z.object({ modelCount: z.number().int().positive() }).strict(),
}).strict()
const automationRunNotificationShape = {
  ...notificationBaseShape,
  action: z.object({
    conversationId: idSchema,
    runId: idSchema,
    type: z.literal('open-conversation'),
  }).strict(),
  lifecycle: z.literal('resolved'),
  payload: z.object({
    automationId: idSchema,
    automationName: z.string().trim().min(1).max(80),
    errorCode: z.string().max(256).nullable(),
  }).strict(),
  resolvedAt: timestampSchema,
}
const notificationSchema = z.discriminatedUnion('kind', [
  modelUpdateNotificationSchema,
  z.object({
    ...automationRunNotificationShape,
    kind: z.literal('automation.run.completed'),
  }).strict(),
  z.object({
    ...automationRunNotificationShape,
    kind: z.literal('automation.run.failed'),
  }).strict(),
])
const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unseenCount: z.number().int().nonnegative(),
}).strict()

const customProviderModelSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  id: z.string().trim().min(1).max(200),
  input: z.array(z.enum(['text', 'image'])).min(1),
  maxTokens: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  reasoning: z.boolean(),
}).strict().refine(model => (
  model.maxTokens === undefined
  || model.contextWindow === undefined
  || model.maxTokens <= model.contextWindow
))

const customProviderSchema = z.object({
  api: z.enum([
    'anthropic-messages',
    'azure-openai-responses',
    'bedrock-converse-stream',
    'google-generative-ai',
    'google-vertex',
    'mistral-conversations',
    'openai-codex-responses',
    'openai-completions',
    'openai-responses',
    'pi-messages',
  ]),
  baseUrl: z.url().refine(isSecureOrLoopbackHttpUrl),
  description: z.string().trim().max(200).optional(),
  displayName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  models: z.array(customProviderModelSchema).default([]),
}).strict().superRefine((provider, context) => {
  const ids = new Set<string>()
  for (const [index, model] of provider.models.entries()) {
    if (ids.has(model.id)) {
      context.addIssue({
        code: 'custom',
        message: 'Model identifiers must be unique',
        path: ['models', index, 'id'],
      })
    }
    ids.add(model.id)
  }
})

const providerAuthChallengeSchema = z.object({
  challengeId: z.uuid(),
  expiresInSeconds: z.number().positive().optional(),
  instructions: z.string().optional(),
  intervalSeconds: z.number().positive().optional(),
  links: z.array(z.object({
    label: z.string().optional(),
    url: z.url(),
  }).strict()).optional(),
  message: z.string().optional(),
  options: z.array(z.object({
    description: z.string().optional(),
    id: z.string(),
    label: z.string(),
  }).strict()).optional(),
  placeholder: z.string().optional(),
  providerId: idSchema,
  type: z.enum([
    'auth_url',
    'device_code',
    'info',
    'manual_code',
    'progress',
    'secret',
    'select',
    'text',
  ]),
  url: z.url().optional(),
  userCode: z.string().optional(),
  verificationUri: z.url().optional(),
}).strict()

const spaceDirectorySchema = z.object({
  accessGrantedAt: timestampSchema,
  canonicalRoot: z.string().min(1),
  createdAt: timestampSchema,
  id: idSchema,
  revision: z.number().int().positive(),
  revokedAt: nullableTimestampSchema,
  root: z.string().min(1),
  spaceId: idSchema,
  updatedAt: timestampSchema,
}).strict()

const spacePrimaryDirectorySchema = spaceDirectorySchema.safeExtend({
  resourcesTrustedAt: timestampSchema,
}).strict()

const spaceSchema = z.object({
  activeRunCount: z.number().int().nonnegative(),
  additionalDirectories: z.array(spaceDirectorySchema).max(32),
  createdAt: timestampSchema,
  id: idSchema,
  memoryScope: z.enum(['personal_and_space', 'space_only']),
  name: z.string().min(1),
  primaryDirectory: spacePrimaryDirectorySchema.nullable(),
  revokedAt: nullableTimestampSchema,
  updatedAt: timestampSchema,
}).strict().refine(space => (
  space.additionalDirectories.length + Number(Boolean(space.primaryDirectory)) <= 32
), { path: ['additionalDirectories'] })

const spaceFileSchema = z.object({
  directoryId: idSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  relativePath: z.string().min(1),
  root: z.string().min(1),
}).strict()

const spaceDirectoryInputSchema = z.object({
  id: idSchema.nullable(),
  root: z.string().min(1),
}).strict()

const spacePrimaryDirectoryInputSchema = spaceDirectoryInputSchema

const skillSchema = z.object({
  description: z.string(),
  enabled: z.boolean(),
  name: z.string().min(1),
  source: z.enum(['builtin', 'directory', 'global', 'space']),
}).strict()

const skillDiagnosticSchema = z.object({
  code: z.enum([
    'SKILL_INVALID',
    'SKILL_NAME_COLLISION',
    'SKILL_PATH_OUTSIDE_SOURCE',
    'SKILL_SOURCE_UNREADABLE',
  ]),
  message: z.string(),
}).strict()

const connectorBaseSchema = z.object({
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(128),
  trusted: z.boolean(),
})

const connectorSchema = z.discriminatedUnion('transport', [
  connectorBaseSchema.extend({
    args: z.array(z.string()),
    command: z.string().min(1),
    cwd: z.string().nullable(),
    transport: z.literal('stdio'),
  }).strict(),
  connectorBaseSchema.extend({
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])

const connectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    args: z.array(z.string().max(4096)).max(128),
    command: z.string().trim().min(1).max(4096),
    cwd: z.string().trim().refine(isAbsolutePath).nullable(),
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('stdio'),
  }).strict(),
  z.object({
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])

const connectorCredentialSchema = z.discriminatedUnion('type', [
  z.object({
    env: z.record(z.string().regex(/^[A-Z_]\w*$/i), z.string().max(16 * 1024)),
    type: z.literal('stdio'),
  }).strict(),
  z.object({
    bearerToken: z.string().min(1).max(64 * 1024).optional(),
    headers: z.record(z.string().min(1), z.string().max(16 * 1024)).optional(),
    type: z.literal('http'),
  }).strict(),
])

const connectorCredentialMutationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }).strict(),
  z.object({ mode: z.literal('clear') }).strict(),
  z.object({ mode: z.literal('replace'), value: connectorCredentialSchema }).strict(),
])

const modelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
}).strict()

const conversationSchema = z.object({
  activeBranchId: z.string().nullable(),
  approvalPolicy: approvalPolicySchema,
  createdAt: timestampSchema,
  deletedAt: nullableTimestampSchema,
  executionProfile: executionProfileSchema,
  id: idSchema,
  modelSelection: modelSelectionSchema.nullable(),
  origin: z.enum(['interactive', 'automation']).optional(),
  spaceId: z.string().nullable(),
  title: z.string().nullable(),
  updatedAt: timestampSchema,
}).strict()

const conversationSummarySchema = conversationSchema.extend({
  activity: z.enum(['idle', 'running', 'awaiting_approval']),
  automationOccurrence: z.object({
    automationId: idSchema,
    occurrenceId: idSchema,
    scheduledFor: timestampSchema,
  }).strict().nullable(),
}).strict()

const conversationBranchSchema = z.object({
  conversationId: idSchema,
  createdAt: timestampSchema,
  forkedFromMessageId: z.string().nullable(),
  id: idSchema,
  parentBranchId: z.string().nullable(),
}).strict()

const attachmentSchema = z.object({
  attachmentId: idSchema,
  kind: z.enum(['image', 'text', 'binary']),
  mimeType: z.string().min(1),
  name: z.string().min(1),
  previewUrl: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
}).strict()

const artifactSchema = z.object({
  artifactId: idSchema,
  conversationId: idSchema,
  createdAt: timestampSchema,
  kind: z.enum(['file', 'directory']),
  mimeType: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).max(32_768),
  previewUrl: z.string().nullable(),
  runId: idSchema,
  sizeBytes: z.number().int().nonnegative(),
  sourceArtifactId: idSchema.nullable(),
  sourceToolCallId: idSchema,
  updatedAt: timestampSchema,
}).strict()

const changeSetSummarySchema = z.object({
  changeSetId: idSchema,
  conversationId: idSchema,
  coverage: z.enum(['complete', 'partial']),
  fileCount: z.number().int().nonnegative(),
  runId: idSchema,
  status: z.enum(['capturing', 'completed']),
  updatedAt: timestampSchema,
}).strict()

const fileChangeDetailSchema = z.object({
  afterSizeBytes: z.number().int().nonnegative().nullable(),
  afterText: z.string().max(1024 * 1024).nullable(),
  beforeSizeBytes: z.number().int().nonnegative().nullable(),
  beforeText: z.string().max(1024 * 1024).nullable(),
  changeType: z.enum(['created', 'deleted', 'modified']),
  id: idSchema,
  language: z.string().max(64).nullable(),
  path: z.string().min(1).max(4096),
  preview: z.enum(['binary', 'oversized', 'sensitive', 'text', 'unavailable']),
  redacted: z.boolean(),
}).strict()

const changeSetDetailSchema = changeSetSummarySchema.extend({
  files: z.array(fileChangeDetailSchema).max(512),
}).strict()

const artifactTextSchema = z.object({
  artifactId: idSchema,
  language: z.string().max(64).nullable(),
  text: z.string().max(2 * 1024 * 1024),
}).strict()

const messageSchema = z.object({
  attachments: z.array(attachmentSchema),
  branchId: idSchema,
  content: z.json(),
  conversationId: idSchema,
  createdAt: timestampSchema,
  id: idSchema,
  role: z.enum(['user', 'assistant', 'tool']),
  runId: z.string().nullable(),
}).strict()

const runStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled'])
const conversationTimelineItemSchema = z.discriminatedUnion('kind', [
  messageSchema.extend({ kind: z.literal('message') }).strict(),
  z.object({
    branchId: idSchema,
    completedAt: nullableTimestampSchema,
    conversationId: idSchema,
    createdAt: timestampSchema,
    errorCode: z.string().nullable(),
    estimatedTokensAfter: z.number().int().nonnegative().nullable(),
    id: idSchema,
    kind: z.literal('compaction'),
    status: runStatusSchema,
    tokensBefore: z.number().int().nonnegative().nullable(),
  }).strict(),
])
const runSchema = z.object({
  approvalPolicy: approvalPolicySchema,
  branchId: idSchema,
  completedAt: nullableTimestampSchema,
  conversationId: idSchema,
  errorCode: z.string().nullable(),
  executionProfile: executionProfileSchema,
  id: idSchema,
  modelId: idSchema,
  providerId: idSchema,
  purpose: z.string().min(1),
  reasoningLevel: z.string().nullable(),
  startedAt: timestampSchema,
  status: runStatusSchema,
  triggeringMessageId: idSchema,
}).strict()
const runOutputSchema = z.object({
  artifacts: z.array(artifactSchema).min(1).max(512),
  createdAt: timestampSchema,
  runId: idSchema,
  sourceToolCallId: idSchema,
}).strict()

const runEventEnvelopeSchema = z.object({
  createdAt: timestampSchema,
  payload: z.unknown(),
  runId: idSchema,
  sequence: z.number().int().positive(),
  type: z.string().min(1),
}).strict()
const runEventSchema = publicRunEventSchema

const approvalSchema = z.object({
  createdAt: timestampSchema,
  id: idSchema,
  kind: z.enum(APPROVAL_REVIEW_KINDS),
  payload: approvalReviewPayloadSchema,
  resolvedAt: nullableTimestampSchema,
  runId: idSchema,
  status: z.enum(['pending', 'approved', 'denied', 'cancelled']),
  summary: z.string().min(1),
  toolCallId: idSchema,
}).strict().refine(
  approval => approvalReviewPayloadMatchesKind(approval.payload, approval.kind),
  { path: ['payload'] },
)

const workspaceDraftSchema = z.object({
  approvalPolicy: approvalPolicySchema,
  attachments: z.array(attachmentSchema),
  composerContent: z.json().nullable(),
  content: z.string(),
  draftId: sessionIdentitySchema,
  executionProfile: executionProfileSchema,
  requestFingerprint: z.string().min(1).max(1024).nullable(),
  requestId: z.string().min(1).max(128).nullable(),
  targetKey: z.string().min(1),
}).strict()

export const LOCAL_WORKSPACE_STATE_KEY = 'buddy.chat.workspace.v2' as const

const legacyWorkspaceStateValueSchema = z.object({
  activeConversationId: z.string().nullable(),
  drafts: z.array(workspaceDraftSchema),
  spaceId: z.string().nullable(),
}).strict()

export const localWorkspaceStateValueSchema = z.object({
  activeConversationId: z.string().nullable(),
  spaceId: z.string().nullable(),
}).strict()

const workspaceSettingSchema = z.object({
  key: z.literal(LOCAL_WORKSPACE_STATE_KEY),
  updatedAt: timestampSchema,
  value: z.union([localWorkspaceStateValueSchema, legacyWorkspaceStateValueSchema]),
}).strict()

const usageRecordSchema = z.object({
  cacheReadCost: z.number().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteCost: z.number().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  id: idSchema,
  inputCost: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  modelId: idSchema,
  outputCost: z.number().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  providerId: idSchema,
  purpose: z.string().min(1),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  runId: idSchema,
  totalCost: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict()

const usageTotalsSchema = z.object({
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict()

const usageSnapshotSchema = z.object({
  records: z.array(usageRecordSchema),
  totals: usageTotalsSchema,
}).strict()

const contextUsageSnapshotIdentitySchema = z.object({
  contextWindow: z.number().int().positive(),
  createdAt: timestampSchema,
  modelId: idSchema,
  providerId: idSchema,
})

const contextUsageSnapshotSchema = z.discriminatedUnion('status', [
  contextUsageSnapshotIdentitySchema.extend({
    status: z.literal('pending'),
  }).strict(),
  contextUsageSnapshotIdentitySchema.extend({
    mcpTokens: z.number().int().nonnegative(),
    messageTokens: z.number().int().nonnegative(),
    skillTokens: z.number().int().nonnegative(),
    status: z.literal('ready'),
    systemPromptTokens: z.number().int().nonnegative(),
    toolTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().positive(),
  }).strict().refine(snapshot => (
    snapshot.mcpTokens
    + snapshot.messageTokens
    + snapshot.skillTokens
    + snapshot.systemPromptTokens
    + snapshot.toolTokens === snapshot.totalTokens
  ), { path: ['totalTokens'] }),
])

const _contextItemSchema = z.object({
  kind: z.enum(['file', 'skill', 'slashCommand']),
  value: z.string().min(1),
}).strict()

const defaultModelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
}).strict()

const turnStartSchema = z.object({
  branchId: idSchema,
  conversationId: idSchema,
  draftReceipt: z.object({
    committedRevision: z.number().int().positive(),
    draftId: sessionIdentitySchema,
    sourceRevision: z.number().int().nonnegative(),
  }).strict().nullable(),
  run: runSchema,
  runId: idSchema,
}).strict()

const chatCommandSchema = buddyComposerDraftSendSchema

const mutationSchema = z.object({ ok: z.literal(true) }).strict()

export const localChatResponseSchemas = {
  composerDraft: buddyComposerDraftSchema,
  composerResource: buddyComposerResourceSchema,
  composerResources: z.array(buddyComposerResourceSchema),
  composerSourceList: buddyComposerSourceListResponseSchema,
  approval: approvalSchema,
  approvals: z.array(approvalSchema),
  automationPreview: automationPreviewResultSchema,
  automation: automationSchema,
  automationOccurrence: automationOccurrenceSchema,
  automationOccurrencePage: automationOccurrencePageSchema,
  automationPage: automationPageSchema,
  automationRunNowResult: automationRunNowResultSchema,
  attachmentPreview: z.object({
    mimeType: z.string().regex(/^image\//),
    path: z.string().refine(isAbsolutePath),
  }).strict(),
  attachments: z.array(attachmentSchema),
  artifactPreview: z.object({
    mimeType: z.string().regex(/^image\//),
    path: z.string().refine(isAbsolutePath),
  }).strict(),
  artifactText: artifactTextSchema,
  changeSet: changeSetDetailSchema,
  connectors: z.array(connectorSchema),
  conversation: conversationSchema,
  conversationBranches: z.array(conversationBranchSchema),
  conversations: z.array(conversationSummarySchema),
  contextUsageSnapshot: contextUsageSnapshotSchema,
  deleted: z.boolean(),
  messagePage: z.object({
    items: z.array(messageSchema),
    nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
  }).strict(),
  timelinePage: z.object({
    changeSets: z.array(changeSetSummarySchema),
    items: z.array(conversationTimelineItemSchema),
    nextCursor: z.string().regex(/^[\w-]+$/).max(2_048).nullable(),
    outputs: z.array(runOutputSchema),
    runEvents: z.array(runEventSchema),
    runs: z.array(runSchema),
  }).strict(),
  model: modelSchema,
  models: z.array(modelSchema),
  notificationList: notificationListSchema,
  mutation: mutationSchema,
  optionalSpace: spaceSchema.nullable(),
  optionalDefaultModel: defaultModelSelectionSchema.nullable(),
  optionalWorkspaceSetting: workspaceSettingSchema.nullable(),
  space: spaceSchema,
  spaceFiles: z.array(spaceFileSchema),
  spaces: z.array(spaceSchema),
  provider: providerSchema,
  providerAuthChallenge: providerAuthChallengeSchema,
  providers: z.array(providerSchema),
  run: runSchema,
  runEvents: z.array(runEventSchema),
  runs: z.array(runSchema),
  runtimeState: runtimeStateSchema,
  skills: z.object({
    diagnostics: z.array(skillDiagnosticSchema),
    skills: z.array(skillSchema),
  }).strict(),
  turnStart: turnStartSchema,
  usageSnapshot: usageSnapshotSchema,
  workspaceSetting: workspaceSettingSchema,
} as const

export const localChatSchemas = {
  composerDraftOpen: buddyComposerDraftOpenSchema,
  composerDraftSave: buddyComposerDraftSaveSchema,
  composerDraftTarget: buddyComposerDraftTargetSchema,
  composerResourceAccept: buddyComposerResourceAcceptSchema,
  composerResourceComplete: buddyComposerResourceCompleteSchema,
  composerResourceDraft: z.object({ draftId: sessionIdentitySchema }).strict(),
  composerResourceFileSelect: z.object({
    draftId: sessionIdentitySchema,
    referencedResourceIds: composerResourceIdsSchema.default([]),
  }).strict(),
  composerResourceTarget: buddyComposerResourceTargetSchema,
  composerSourceSelect: buddyComposerSourceSelectSchema.extend({
    referencedResourceIds: composerResourceIdsSchema.default([]),
  }).strict(),
  composerSpaceFileSelect: buddyComposerSpaceFileSelectSchema.extend({
    referencedResourceIds: composerResourceIdsSchema.default([]),
  }).strict(),
  approvalId: z.object({ approvalId: idSchema }).strict(),
  artifactPreview: z.object({ artifactId: idSchema }).strict(),
  artifactText: z.object({ artifactId: idSchema }).strict(),
  automationChanged: automationChangedNotificationSchema,
  automationCreate: automationMutationRequestSchemas.create,
  automationDelete: automationMutationRequestSchemas.delete,
  automationDeleteOccurrence: automationRequestSchemas.deleteOccurrence,
  automationGet: automationRequestSchemas.get,
  automationList: automationRequestSchemas.list,
  automationListOccurrences: automationRequestSchemas.listOccurrences,
  automationPause: automationMutationRequestSchemas.pause,
  automationPreview: automationPreviewRequestSchema,
  automationResume: automationMutationRequestSchemas.resume,
  automationRunNow: automationMutationRequestSchemas.runNow,
  automationUpdate: automationMutationRequestSchemas.update,
  attachmentPreview: z.object({ attachmentId: idSchema }).strict(),
  chatCommand: chatCommandSchema,
  changeSet: z.object({ changeSetId: idSchema }).strict(),
  connectorCredential: z.object({
    connectorId: idSchema,
    credential: connectorCredentialSchema,
  }).strict(),
  connectorId: z.object({ connectorId: idSchema }).strict(),
  connectorUpsert: z.object({
    config: connectorConfigSchema,
    credential: connectorCredentialMutationSchema,
  }).strict(),
  conversationBranchActivation: z.object({
    branchId: idSchema,
    conversationId: idSchema,
  }).strict(),
  conversationId: z.object({ conversationId: idSchema }).strict(),
  conversationMessages: z.object({
    branchId: idSchema.optional(),
    conversationId: idSchema,
    cursor: optionalCursorSchema,
    limit: optionalLimitSchema,
  }).strict(),
  conversationRename: z.object({
    conversationId: idSchema,
    title: z.string().trim().min(1).max(80),
  }).strict(),
  conversationPermissionSettings: z.object({
    approvalPolicy: approvalPolicySchema,
    conversationId: idSchema,
    executionProfile: executionProfileSchema,
  }).strict(),
  conversationModelSelection: z.object({
    conversationId: idSchema,
    modelSelection: modelSelectionSchema,
  }).strict(),
  conversationTimeline: z.object({
    branchId: idSchema.optional(),
    conversationId: idSchema,
    cursor: optionalCursorSchema,
    limit: optionalLimitSchema,
  }).strict(),
  contextUsageSnapshot: z.object({
    approvalPolicy: approvalPolicySchema,
    branchId: sessionIdentitySchema.nullable(),
    conversationId: sessionIdentitySchema.nullable(),
    draftId: sessionIdentitySchema,
    executionProfile: executionProfileSchema,
    modelSelection: modelSelectionSchema,
    spaceId: idSchema.nullable(),
  }).strict().refine(input => (
    (input.conversationId === null) === (input.branchId === null)
  ), { path: ['branchId'] }),
  empty: z.object({}).strict(),
  limit: z.object({ limit: optionalLimitSchema }).strict(),
  listApprovals: z.object({
    limit: optionalLimitSchema,
    runId: z.string().nullable().optional(),
    status: z.enum(['pending', 'approved', 'denied', 'cancelled']).nullable().optional(),
  }).strict(),
  listModels: z.object({ providerId: z.string().nullable().optional() }).strict(),
  listRuns: z.object({
    conversationId: z.string().nullable().optional(),
    limit: optionalLimitSchema,
  }).strict(),
  spaceFileSearch: z.object({
    spaceId: idSchema,
    query: z.string().max(512),
  }).strict(),
  spaceCreate: z.object({
    memoryScope: z.enum(['personal_and_space', 'space_only']),
    name: z.string().trim().min(1).max(80),
    primaryDirectory: spacePrimaryDirectoryInputSchema.nullable(),
  }).strict(),
  spaceId: z.object({ spaceId: idSchema }).strict(),
  spaceUpdate: z.object({
    memoryScope: z.enum(['personal_and_space', 'space_only']),
    name: z.string().trim().min(1).max(80),
    primaryDirectory: spacePrimaryDirectoryInputSchema.nullable(),
    spaceId: idSchema,
  }).strict(),
  providerAuthCancel: z.object({ challengeId: z.uuid() }).strict(),
  providerAuthResponse: z.object({
    challengeId: z.uuid(),
    value: z.string().max(64 * 1024),
  }).strict(),
  providerId: z.object({ providerId: idSchema }).strict(),
  providerEnabled: z.object({
    enabled: z.boolean(),
    providerId: idSchema,
  }).strict(),
  providerLogin: z.object({
    authType: z.enum(['api_key', 'oauth']),
    providerId: idSchema,
  }).strict(),
  providerManualModel: z.object({
    model: customProviderModelSchema,
    providerId: idSchema,
  }).strict(),
  providerModel: z.object({
    modelId: idSchema,
    providerId: idSchema,
  }).strict(),
  providerModelParameters: z.object({
    modelId: idSchema,
    parameters: modelParametersOverrideSchema,
    providerId: idSchema,
  }).strict(),
  providerModelEnabled: z.object({
    enabled: z.boolean(),
    modelId: idSchema,
    providerId: idSchema,
  }).strict(),
  providerUpsert: z.object({ provider: customProviderSchema }).strict(),
  defaultModel: z.object({
    model: defaultModelSelectionSchema.nullable(),
  }).strict(),
  editUserMessage: z.object({
    conversationId: idSchema,
    draftId: sessionIdentitySchema,
    expectedRevision: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(128),
    userMessageId: idSchema,
  }).strict(),
  regenerateAssistant: z.object({
    conversationId: idSchema,
    requestId: z.string().min(1).max(128),
    sourceRunId: idSchema,
  }).strict(),
  runEvents: z.union([
    z.object({
      afterSequence: z.number().int().nonnegative().optional(),
      limit: optionalEventLimitSchema,
      runId: idSchema,
    }).strict(),
    z.object({
      conversationId: idSchema,
      limit: optionalEventLimitSchema,
    }).strict(),
  ]),
  runId: z.object({ runId: idSchema }).strict(),
  notificationRevision: z.object({
    notificationId: idSchema,
    revision: z.string().min(1).max(512),
  }).strict(),
  skillScope: z.object({ spaceId: idSchema.nullable() }).strict(),
  runStateEvent: runEventEnvelopeSchema,
  startTurn: buddyComposerDraftSendSchema,
  workspaceValue: z.object({ value: localWorkspaceStateValueSchema }).strict(),
} as const

type DeepReadonly<T> = T extends ReadonlyArray<infer Item>
  ? ReadonlyArray<DeepReadonly<Item>>
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export type LocalApproval = DeepReadonly<z.infer<typeof approvalSchema>>
export type LocalAttachment = DeepReadonly<z.infer<typeof attachmentSchema>>
export type LocalArtifact = DeepReadonly<z.infer<typeof artifactSchema>>
export type LocalArtifactText = DeepReadonly<z.infer<typeof artifactTextSchema>>
export type LocalAutomation = DeepReadonly<z.infer<typeof automationSchema>>
export type LocalAutomationOccurrence
  = DeepReadonly<z.infer<typeof automationOccurrenceSchema>>
export type LocalAutomationOccurrencePage
  = DeepReadonly<z.infer<typeof automationOccurrencePageSchema>>
export type LocalAutomationPage = DeepReadonly<z.infer<typeof automationPageSchema>>
export type LocalAutomationRunNowResult
  = DeepReadonly<z.infer<typeof automationRunNowResultSchema>>
export type LocalAutomationListItem = LocalAutomationPage['items'][number]
export type LocalAutomationCreateRequest = z.input<typeof localChatSchemas.automationCreate>
export type LocalAutomationUpdateRequest = z.input<typeof localChatSchemas.automationUpdate>
export type LocalAutomationMutationRequest = z.input<typeof localChatSchemas.automationPause>
export type LocalAutomationListRequest = z.input<typeof localChatSchemas.automationList>
export type LocalAutomationOccurrenceListRequest
  = z.input<typeof localChatSchemas.automationListOccurrences>
export type LocalAutomationPreviewRequest
  = DeepReadonly<z.infer<typeof automationPreviewRequestSchema>>
export type LocalAutomationPreviewResult
  = DeepReadonly<z.infer<typeof automationPreviewResultSchema>>
export type LocalConnector = DeepReadonly<z.infer<typeof connectorSchema>>
export type LocalConnectorConfig = z.infer<typeof connectorConfigSchema>
export type LocalConnectorCredential = z.infer<typeof connectorCredentialSchema>
export type LocalConnectorCredentialMutation = z.infer<typeof connectorCredentialMutationSchema>
export type LocalComposerDraft = DeepReadonly<z.infer<typeof buddyComposerDraftSchema>>
export type LocalComposerDraftOpen = z.input<typeof buddyComposerDraftOpenSchema>
export type LocalComposerDraftSave = z.input<typeof buddyComposerDraftSaveSchema>
export type LocalConversation = DeepReadonly<z.infer<typeof conversationSchema>>
export type LocalConversationSummary = DeepReadonly<z.infer<typeof conversationSummarySchema>>
export type LocalConversationBranch = DeepReadonly<z.infer<typeof conversationBranchSchema>>
export type LocalChatCommandRequest = z.infer<typeof chatCommandSchema>
export type LocalChangeSetDetail = DeepReadonly<z.infer<typeof changeSetDetailSchema>>
export type LocalChangeSetSummary = DeepReadonly<z.infer<typeof changeSetSummarySchema>>
export type LocalFileChangeDetail = DeepReadonly<z.infer<typeof fileChangeDetailSchema>>
export type LocalCustomProvider = z.input<typeof customProviderSchema>
export type LocalCustomProviderModel = z.input<typeof customProviderModelSchema>
export type LocalMessage = DeepReadonly<z.infer<typeof messageSchema>>
export type LocalMessagePage = DeepReadonly<z.infer<typeof localChatResponseSchemas.messagePage>>
export type LocalNotification = DeepReadonly<z.infer<typeof notificationSchema>>
export type LocalNotificationList = DeepReadonly<z.infer<typeof notificationListSchema>>
export type LocalConversationTimelineItem = DeepReadonly<z.infer<typeof conversationTimelineItemSchema>>
export type LocalConversationTimelinePage = DeepReadonly<z.infer<typeof localChatResponseSchemas.timelinePage>>
export type LocalContextUsageSnapshot = DeepReadonly<z.infer<typeof contextUsageSnapshotSchema>>
export type LocalContextUsageSnapshotRequest = z.infer<typeof localChatSchemas.contextUsageSnapshot>
export type LocalDefaultModel = DeepReadonly<z.infer<typeof defaultModelSelectionSchema>>
export type LocalSpace = DeepReadonly<z.infer<typeof spaceSchema>>
export type LocalSpaceAdditionalDirectory = DeepReadonly<z.infer<typeof spaceDirectorySchema>>
export type LocalSpaceCreateInput = z.infer<typeof localChatSchemas.spaceCreate>
export type LocalSpaceFile = DeepReadonly<z.infer<typeof spaceFileSchema>>
export type LocalSpacePrimaryDirectory = DeepReadonly<z.infer<typeof spacePrimaryDirectorySchema>>
export type LocalSpaceUpdateInput = z.infer<typeof localChatSchemas.spaceUpdate>
export type LocalProvider = DeepReadonly<z.infer<typeof providerSchema>>
export type LocalProviderAuthChallenge = DeepReadonly<z.infer<typeof providerAuthChallengeSchema>>
export type LocalPromptContextItem = z.infer<typeof _contextItemSchema>
export type LocalRun = DeepReadonly<z.infer<typeof runSchema>>
export type LocalRunOutput = DeepReadonly<z.infer<typeof runOutputSchema>>
export type LocalRunEvent = DeepReadonly<z.infer<typeof runEventSchema>>
export type LocalRuntimeModelOption = DeepReadonly<z.infer<typeof modelSchema>>
export type LocalBuddyServiceSupervisorState = DeepReadonly<z.infer<typeof runtimeStateSchema>>
export type LocalSkillCatalog = DeepReadonly<z.infer<typeof localChatResponseSchemas.skills>>
export type LocalStartTurnRequest = z.infer<typeof localChatSchemas.startTurn>
export type LocalTurnStart = DeepReadonly<z.infer<typeof turnStartSchema>>
export type LocalUsageSnapshot = DeepReadonly<z.infer<typeof usageSnapshotSchema>>
export type LocalWorkspaceDraft = DeepReadonly<z.infer<typeof workspaceDraftSchema>>
export type LocalWorkspaceSetting = DeepReadonly<z.infer<typeof workspaceSettingSchema>>
export type LocalWorkspaceStateValue = DeepReadonly<z.infer<typeof localWorkspaceStateValueSchema>>

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Z]:[\\/]/i.test(value) || value.startsWith('\\\\')
}
