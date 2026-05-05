import { z } from 'zod'
import { ChatMessageRoleSchema } from '../chat'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AgentChatReplyContextSchema = z.object({
  chatSessionId: NonEmptyStringSchema,
  triggerMessageOrder: z.number().int().min(0),
  nextAssistantOrder: z.number().int().min(0),
  expectedHistoryVersion: z.number().int().min(0),
}).strict()

export const AgentChatContextMessageSchema = z.object({
  role: ChatMessageRoleSchema,
  content: z.string(),
  order: z.number().int().min(0),
}).strict()

export const AgentGetChatSessionContextRequestSchema = z.object({
  actorId: NonEmptyStringSchema,
  triggerMessageOrder: z.number().int().min(0),
}).strict()

export const AgentGetChatSessionContextResponseSchema = z.object({
  sessionId: NonEmptyStringSchema,
  historyVersion: z.number().int().min(0),
  messages: z.array(AgentChatContextMessageSchema),
}).strict()

export type AgentChatReplyContext = z.infer<typeof AgentChatReplyContextSchema>
export type AgentChatContextMessage = z.infer<typeof AgentChatContextMessageSchema>
export type AgentGetChatSessionContextRequest = z.infer<typeof AgentGetChatSessionContextRequestSchema>
export type AgentGetChatSessionContextResponse = z.infer<typeof AgentGetChatSessionContextResponseSchema>
