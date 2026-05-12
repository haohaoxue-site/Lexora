import { z } from 'zod'
import { AiAvailableModelOptionSchema, AiModelRefSchema } from './ai'

export const ChatMessageRoleSchema = z.enum(['user', 'assistant'])
export const CHAT_MESSAGE_STATUS = {
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export const CHAT_MESSAGE_STATUS_VALUES = [
  CHAT_MESSAGE_STATUS.STREAMING,
  CHAT_MESSAGE_STATUS.COMPLETED,
  CHAT_MESSAGE_STATUS.FAILED,
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

export const CHAT_STREAM_EVENT_TYPE = {
  MESSAGE_STARTED: 'message.started',
  REASONING_DELTA: 'reasoning.delta',
  TEXT_DELTA: 'text.delta',
  MESSAGE_COMPLETED: 'message.completed',
  RUN_COMPLETED: 'run.completed',
  ERROR: 'error',
  TOOL_CALL_STARTED: 'tool.call.started',
  TOOL_CALL_ARGS_DELTA: 'tool.call.args.delta',
  TOOL_CALL_COMPLETED: 'tool.call.completed',
  TOOL_RESULT: 'tool.result',
} as const

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
  order: z.number().int().nonnegative(),
  parts: z.array(ChatMessagePartSchema),
  metadata: ChatMessageMetadataSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
  completedAt: IsoDateTimeStringSchema.nullable(),
}).strict()

export const ChatSessionSummarySchema = ChatSessionSummaryBaseSchema

export const ChatSessionDetailSchema = ChatSessionSummarySchema.extend({
  messages: z.array(ChatMessageSchema),
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

export const CreateChatCompletionRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  content: z.string().max(40_000),
}).strict()

export const UpdateChatSessionModelRequestSchema = z.object({
  modelRef: AiModelRefSchema.pick({
    providerId: true,
    modelId: true,
  }).nullable(),
}).strict()

export const UpdateChatSessionTitleRequestSchema = z.object({
  title: ChatSessionTitleSchema,
}).strict()

const ChatStreamMessageStartedEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.MESSAGE_STARTED),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  role: z.literal('assistant'),
}).strict()

const ChatStreamReasoningDeltaEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.REASONING_DELTA),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  text: z.string(),
}).strict()

const ChatStreamTextDeltaEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.TEXT_DELTA),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  text: z.string(),
}).strict()

const ChatStreamMessageCompletedEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.MESSAGE_COMPLETED),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  content: z.string(),
}).strict()

const ChatStreamRunCompletedEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.RUN_COMPLETED),
  runId: NonEmptyStringSchema,
}).strict()

const ChatStreamErrorEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.ERROR),
  runId: NonEmptyStringSchema.optional(),
  message: NonEmptyStringSchema,
  code: NonEmptyStringSchema.optional(),
}).strict()

const ChatStreamToolCallStartedEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.TOOL_CALL_STARTED),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
  toolName: NonEmptyStringSchema,
}).strict()

const ChatStreamToolCallArgsDeltaEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.TOOL_CALL_ARGS_DELTA),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
  text: z.string(),
}).strict()

const ChatStreamToolCallCompletedEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.TOOL_CALL_COMPLETED),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
}).strict()

const ChatStreamToolResultEventSchema = z.object({
  type: z.literal(CHAT_STREAM_EVENT_TYPE.TOOL_RESULT),
  runId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
  content: z.string(),
}).strict()

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  ChatStreamMessageStartedEventSchema,
  ChatStreamReasoningDeltaEventSchema,
  ChatStreamTextDeltaEventSchema,
  ChatStreamMessageCompletedEventSchema,
  ChatStreamRunCompletedEventSchema,
  ChatStreamErrorEventSchema,
  ChatStreamToolCallStartedEventSchema,
  ChatStreamToolCallArgsDeltaEventSchema,
  ChatStreamToolCallCompletedEventSchema,
  ChatStreamToolResultEventSchema,
])

export type ChatMessageStatus = z.infer<typeof ChatMessageStatusSchema>
export type ChatMessagePartType = z.infer<typeof ChatMessagePartTypeSchema>
export type ChatMessageFailureReason = z.infer<typeof ChatMessageFailureReasonSchema>
export type ChatMessageMetadata = z.infer<typeof ChatMessageMetadataSchema>
export type ChatMessagePartMetadata = z.infer<typeof ChatMessagePartMetadataSchema>
export type ChatMessagePart = z.infer<typeof ChatMessagePartSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatSessionSummary = z.infer<typeof ChatSessionSummarySchema>
export type ChatSessionDetail = z.infer<typeof ChatSessionDetailSchema>
export type ChatModelItem = z.infer<typeof ChatModelItemSchema>
export type ChatModelListResponse = z.infer<typeof ChatModelListResponseSchema>
export type ChatRuntimeConfig = z.infer<typeof ChatRuntimeConfigSchema>
export type CreateChatCompletionRequest = z.infer<typeof CreateChatCompletionRequestSchema>
export type UpdateChatSessionModelRequest = z.infer<typeof UpdateChatSessionModelRequestSchema>
export type UpdateChatSessionTitleRequest = z.infer<typeof UpdateChatSessionTitleRequestSchema>
export type ChatModelSelection = UpdateChatSessionModelRequest
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>
