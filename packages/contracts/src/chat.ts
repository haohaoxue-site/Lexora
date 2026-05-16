import { z } from 'zod'
import { AiAvailableModelOptionSchema, AiModelRefSchema } from './ai'

export const ChatMessageRoleSchema = z.enum(['user', 'assistant'])
export const CHAT_MESSAGE_STATUS = {
  PENDING: 'pending',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export const CHAT_MESSAGE_STATUS_VALUES = [
  CHAT_MESSAGE_STATUS.PENDING,
  CHAT_MESSAGE_STATUS.STREAMING,
  CHAT_MESSAGE_STATUS.COMPLETED,
  CHAT_MESSAGE_STATUS.FAILED,
  CHAT_MESSAGE_STATUS.CANCELLED,
] as const

export const CHAT_MESSAGE_PART_TYPE = {
  REASONING: 'reasoning',
  TEXT: 'text',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  SOURCE: 'source',
  CITATION: 'citation',
} as const

export const CHAT_MESSAGE_PART_TYPE_VALUES = [
  CHAT_MESSAGE_PART_TYPE.REASONING,
  CHAT_MESSAGE_PART_TYPE.TEXT,
  CHAT_MESSAGE_PART_TYPE.TOOL_CALL,
  CHAT_MESSAGE_PART_TYPE.TOOL_RESULT,
  CHAT_MESSAGE_PART_TYPE.SOURCE,
  CHAT_MESSAGE_PART_TYPE.CITATION,
] as const

export const CHAT_MESSAGE_FAILURE_REASON = {
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
} as const

export const CHAT_MESSAGE_FAILURE_REASON_VALUES = [
  CHAT_MESSAGE_FAILURE_REASON.FAILED,
  CHAT_MESSAGE_FAILURE_REASON.CANCELLED,
  CHAT_MESSAGE_FAILURE_REASON.TIMED_OUT,
] as const

export const CHAT_RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export const CHAT_RUN_STATUS_VALUES = [
  CHAT_RUN_STATUS.PENDING,
  CHAT_RUN_STATUS.RUNNING,
  CHAT_RUN_STATUS.COMPLETED,
  CHAT_RUN_STATUS.FAILED,
  CHAT_RUN_STATUS.CANCELLED,
] as const

export const CHAT_SESSION_EVENT_TYPE = {
  MESSAGE_CREATED: 'chat.message.created',
  MESSAGE_STATUS_CHANGED: 'chat.message.status.changed',
  MESSAGE_PART_DELTA: 'chat.message.part.delta',
  MESSAGE_COMPLETED: 'chat.message.completed',
  MESSAGE_FAILED: 'chat.message.failed',
  MESSAGE_CANCELLED: 'chat.message.cancelled',
  RUN_STARTED: 'chat.run.started',
  RUN_COMPLETED: 'chat.run.completed',
  RUN_FAILED: 'chat.run.failed',
  RUN_CANCELLED: 'chat.run.cancelled',
  BRANCH_SWITCHED: 'chat.branch.switched',
  TITLE_UPDATED: 'chat.title.updated',
  SNAPSHOT_REQUIRED: 'chat.snapshot.required',
} as const

export const CHAT_SESSION_EVENT_TYPE_VALUES = [
  CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED,
  CHAT_SESSION_EVENT_TYPE.MESSAGE_STATUS_CHANGED,
  CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA,
  CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED,
  CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED,
  CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED,
  CHAT_SESSION_EVENT_TYPE.RUN_STARTED,
  CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED,
  CHAT_SESSION_EVENT_TYPE.RUN_FAILED,
  CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED,
  CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED,
  CHAT_SESSION_EVENT_TYPE.TITLE_UPDATED,
  CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED,
] as const

export const CHAT_SESSION_DEFAULT_TITLE = '新对话'
export const CHAT_SESSION_TITLE_MAX_LENGTH = 120

const IsoDateTimeStringSchema = z.string().datetime()
const NonEmptyStringSchema = z.string().trim().min(1)
const ChatSessionTitleSchema = z.string().trim().min(1).max(CHAT_SESSION_TITLE_MAX_LENGTH)
const ChatSessionSummaryBaseSchema = z.object({
  id: NonEmptyStringSchema,
  title: ChatSessionTitleSchema,
  modelRef: AiModelRefSchema.pick({
    providerId: true,
    modelId: true,
  }).nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const ChatMessageStatusSchema = z.enum(CHAT_MESSAGE_STATUS_VALUES)
export const ChatMessagePartTypeSchema = z.enum(CHAT_MESSAGE_PART_TYPE_VALUES)
export const ChatMessageFailureReasonSchema = z.enum(CHAT_MESSAGE_FAILURE_REASON_VALUES)
export const ChatRunStatusSchema = z.enum(CHAT_RUN_STATUS_VALUES)
export const ChatSessionEventTypeSchema = z.enum(CHAT_SESSION_EVENT_TYPE_VALUES)

export const ChatMessageBranchSchema = z.object({
  index: z.number().int().positive(),
  count: z.number().int().positive(),
  previousMessageId: NonEmptyStringSchema.nullable(),
  nextMessageId: NonEmptyStringSchema.nullable(),
}).strict()

export const ChatMessageMetadataSchema = z.object({
  failureReason: ChatMessageFailureReasonSchema.optional(),
  failureMessage: z.string().trim().min(1).optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
  reasoningElapsedMs: z.number().int().nonnegative().optional(),
  finishReason: z.string().trim().min(1).optional(),
}).strict()

export const ChatMessagePartMetadataSchema = z.object({
  elapsedMs: z.number().int().nonnegative().optional(),
  toolCallId: z.string().trim().min(1).optional(),
  toolName: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  citationTarget: z.string().trim().min(1).optional(),
}).strict()

export const ChatMessagePartSchema = z.object({
  id: NonEmptyStringSchema,
  type: ChatMessagePartTypeSchema,
  text: z.string(),
  order: z.number().int().nonnegative(),
  metadata: ChatMessagePartMetadataSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const ChatMessageSchema = z.object({
  id: NonEmptyStringSchema,
  role: ChatMessageRoleSchema,
  status: ChatMessageStatusSchema,
  content: z.string(),
  branch: ChatMessageBranchSchema,
  parts: z.array(ChatMessagePartSchema),
  metadata: ChatMessageMetadataSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
  completedAt: IsoDateTimeStringSchema.nullable(),
}).strict()

export const ChatSessionSummarySchema = ChatSessionSummaryBaseSchema

export const ChatRunSummarySchema = z.object({
  runId: NonEmptyStringSchema,
  status: ChatRunStatusSchema,
  assistantMessageId: NonEmptyStringSchema,
  triggerUserMessageId: NonEmptyStringSchema,
  createdAt: IsoDateTimeStringSchema,
  startedAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
}).strict()

export const ChatSessionDetailSchema = ChatSessionSummarySchema.extend({
  latestSequence: z.number().int().nonnegative(),
  messages: z.array(ChatMessageSchema),
  activeRun: ChatRunSummarySchema.nullable().optional(),
}).strict()

export const ChatModelItemSchema = AiAvailableModelOptionSchema

export const ChatModelListResponseSchema = z.object({
  models: z.array(ChatModelItemSchema),
}).strict()

export const ChatRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  ready: z.boolean(),
  defaultModel: ChatModelItemSchema.nullable(),
  notReadyReason: z.string().trim().min(1).nullable(),
}).strict()

export const CreateChatSessionMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(40_000),
}).strict()

export const EditAndSendChatMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(40_000),
}).strict()

export const RetryChatAssistantMessageRequestSchema = z.object({}).strict()

export const SwitchChatActiveMessageRequestSchema = z.object({
  messageId: NonEmptyStringSchema,
}).strict()

export const CancelChatRunRequestSchema = z.object({}).strict()

export const UpdateChatSessionModelRequestSchema = z.object({
  modelRef: AiModelRefSchema.pick({
    providerId: true,
    modelId: true,
  }).nullable(),
}).strict()

export const UpdateChatSessionTitleRequestSchema = z.object({
  title: ChatSessionTitleSchema,
}).strict()

export const BatchDeleteChatSessionsRequestSchema = z.object({
  sessionIds: z.array(NonEmptyStringSchema).min(1).max(100),
}).strict()

export const BatchDeleteChatSessionsResponseSchema = z.object({
  deletedSessionIds: z.array(NonEmptyStringSchema),
}).strict()

export const ChatMutationResponseSchema = z.object({
  session: ChatSessionDetailSchema,
  latestSequence: z.number().int().nonnegative(),
  run: ChatRunSummarySchema.optional(),
}).strict()

const ChatSessionEventBaseSchema = z.object({
  sequence: z.number().int().positive(),
  sessionId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema.nullable(),
  runId: NonEmptyStringSchema.nullable(),
  sourceEventId: NonEmptyStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
})

const ChatSessionEventPayloadSchema = z.record(z.string(), z.unknown())

const ChatSessionMessagePartDeltaEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA),
  messageId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  sourceEventId: NonEmptyStringSchema,
  payload: z.object({
    partType: ChatMessagePartTypeSchema,
    delta: z.string(),
  }).strict(),
}).strict()

const ChatSessionSnapshotRequiredEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED),
  messageId: z.null(),
  runId: z.null(),
  sourceEventId: z.null(),
  payload: z.object({
    reason: z.literal('cursor_expired'),
    latestSequence: z.number().int().nonnegative(),
  }).strict(),
}).strict()

const ChatSessionMessageCreatedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED),
  messageId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionMessageStatusChangedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_STATUS_CHANGED),
  messageId: NonEmptyStringSchema,
  payload: z.object({
    status: ChatMessageStatusSchema,
  }).strict(),
}).strict()

const ChatSessionMessageCompletedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED),
  messageId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionMessageFailedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED),
  messageId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionMessageCancelledEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED),
  messageId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionRunStartedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.RUN_STARTED),
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionRunCompletedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED),
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionRunFailedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.RUN_FAILED),
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionRunCancelledEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED),
  runId: NonEmptyStringSchema,
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionBranchSwitchedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED),
  payload: ChatSessionEventPayloadSchema,
}).strict()

const ChatSessionTitleUpdatedEventSchema = ChatSessionEventBaseSchema.extend({
  type: z.literal(CHAT_SESSION_EVENT_TYPE.TITLE_UPDATED),
  payload: z.object({
    title: ChatSessionTitleSchema,
  }).strict(),
}).strict()

export const ChatSessionEventSchema = z.discriminatedUnion('type', [
  ChatSessionMessageCreatedEventSchema,
  ChatSessionMessageStatusChangedEventSchema,
  ChatSessionMessagePartDeltaEventSchema,
  ChatSessionMessageCompletedEventSchema,
  ChatSessionMessageFailedEventSchema,
  ChatSessionMessageCancelledEventSchema,
  ChatSessionRunStartedEventSchema,
  ChatSessionRunCompletedEventSchema,
  ChatSessionRunFailedEventSchema,
  ChatSessionRunCancelledEventSchema,
  ChatSessionBranchSwitchedEventSchema,
  ChatSessionTitleUpdatedEventSchema,
  ChatSessionSnapshotRequiredEventSchema,
])

export type ChatMessageStatus = z.infer<typeof ChatMessageStatusSchema>
export type ChatMessagePartType = z.infer<typeof ChatMessagePartTypeSchema>
export type ChatMessageFailureReason = z.infer<typeof ChatMessageFailureReasonSchema>
export type ChatRunStatus = z.infer<typeof ChatRunStatusSchema>
export type ChatSessionEventType = z.infer<typeof ChatSessionEventTypeSchema>
export type ChatMessageBranch = z.infer<typeof ChatMessageBranchSchema>
export type ChatMessageMetadata = z.infer<typeof ChatMessageMetadataSchema>
export type ChatMessagePartMetadata = z.infer<typeof ChatMessagePartMetadataSchema>
export type ChatMessagePart = z.infer<typeof ChatMessagePartSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatSessionSummary = z.infer<typeof ChatSessionSummarySchema>
export type ChatSessionDetail = z.infer<typeof ChatSessionDetailSchema>
export type ChatModelItem = z.infer<typeof ChatModelItemSchema>
export type ChatModelListResponse = z.infer<typeof ChatModelListResponseSchema>
export type ChatRuntimeConfig = z.infer<typeof ChatRuntimeConfigSchema>
export type ChatRunSummary = z.infer<typeof ChatRunSummarySchema>
export type CreateChatSessionMessageRequest = z.infer<typeof CreateChatSessionMessageRequestSchema>
export type EditAndSendChatMessageRequest = z.infer<typeof EditAndSendChatMessageRequestSchema>
export type RetryChatAssistantMessageRequest = z.infer<typeof RetryChatAssistantMessageRequestSchema>
export type SwitchChatActiveMessageRequest = z.infer<typeof SwitchChatActiveMessageRequestSchema>
export type CancelChatRunRequest = z.infer<typeof CancelChatRunRequestSchema>
export type ChatMutationResponse = z.infer<typeof ChatMutationResponseSchema>
export type UpdateChatSessionModelRequest = z.infer<typeof UpdateChatSessionModelRequestSchema>
export type UpdateChatSessionTitleRequest = z.infer<typeof UpdateChatSessionTitleRequestSchema>
export type BatchDeleteChatSessionsRequest = z.infer<typeof BatchDeleteChatSessionsRequestSchema>
export type BatchDeleteChatSessionsResponse = z.infer<typeof BatchDeleteChatSessionsResponseSchema>
export type ChatModelSelection = UpdateChatSessionModelRequest
export type ChatSessionEvent = z.infer<typeof ChatSessionEventSchema>
