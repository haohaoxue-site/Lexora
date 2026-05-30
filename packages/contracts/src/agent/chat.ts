import { z } from 'zod'
import {
  ChatMessageContextSnapshotMetaSchema,
  ChatMessageRoleSchema,
} from '../chat'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AGENT_CHAT_THREAD_PREFIX = 'chat:'

export const AgentChatReplyContextSchema = z.object({
  chatSessionId: NonEmptyStringSchema,
  triggerUserMessageId: NonEmptyStringSchema,
  assistantMessageId: NonEmptyStringSchema,
  expectedHistoryVersion: z.number().int().min(0),
}).strict()

export const AgentChatContextMessageSchema = z.object({
  id: NonEmptyStringSchema,
  role: ChatMessageRoleSchema,
  content: z.string(),
}).strict()

export const AgentChatContextSnapshotSchema = ChatMessageContextSnapshotMetaSchema.extend({
  order: z.number().int().nonnegative(),
  content: z.string(),
}).strict()

export const AgentGetChatSessionContextRequestSchema = z.object({
  actorId: NonEmptyStringSchema,
  triggerUserMessageId: NonEmptyStringSchema,
}).strict()

export const AgentChatRuntimeContextSchema = z.object({
  sessionId: NonEmptyStringSchema,
  threadId: NonEmptyStringSchema,
  sessionHistoryVersion: z.number().int().min(0),
  activePathKey: NonEmptyStringSchema,
  triggerUserMessageId: NonEmptyStringSchema,
  triggerParentMessageId: NonEmptyStringSchema.nullable(),
  assistantMessageId: NonEmptyStringSchema,
  messages: z.array(AgentChatContextMessageSchema),
  contextSnapshots: z.array(AgentChatContextSnapshotSchema),
}).strict()

export const AgentGetChatSessionContextResponseSchema = AgentChatRuntimeContextSchema

export type AgentChatReplyContext = z.infer<typeof AgentChatReplyContextSchema>
export type AgentChatContextMessage = z.infer<typeof AgentChatContextMessageSchema>
export type AgentChatContextSnapshot = z.infer<typeof AgentChatContextSnapshotSchema>
export type AgentChatRuntimeContext = z.infer<typeof AgentChatRuntimeContextSchema>
export type AgentGetChatSessionContextRequest = z.infer<typeof AgentGetChatSessionContextRequestSchema>
export type AgentGetChatSessionContextResponse = z.infer<typeof AgentGetChatSessionContextResponseSchema>
