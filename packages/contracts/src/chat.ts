import { z } from 'zod'
import { AiAvailableModelOptionSchema, AiModelRefSchema } from './ai'

export const ChatMessageRoleSchema = z.enum(['user', 'assistant'])
export const CHAT_SESSION_DEFAULT_TITLE = '新对话'
export const CHAT_SESSION_TITLE_MAX_LENGTH = 120

const IsoDateTimeStringSchema = z.string().datetime()
const ChatSessionTitleSchema = z.string().trim().min(1).max(CHAT_SESSION_TITLE_MAX_LENGTH)
const ChatSessionSummaryBaseSchema = z.object({
  id: z.string().trim().min(1),
  title: ChatSessionTitleSchema,
  modelRef: AiModelRefSchema.pick({
    providerId: true,
    modelId: true,
  }).nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
}).strict()

export const ChatMessageSchema = z.object({
  role: ChatMessageRoleSchema,
  content: z.string(),
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
