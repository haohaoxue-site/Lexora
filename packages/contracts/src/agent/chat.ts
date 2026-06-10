import { z } from 'zod'
import {
  ChatMessageContextSnapshotMetaSchema,
  ChatMessageRoleSchema,
} from '../chat'
import { AgentMemoryRunOptionsSchema } from './memory'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AGENT_CHAT_THREAD_PREFIX = 'chat:'

export const AgentChatContextMessageSchema = z.object({
  id: NonEmptyStringSchema,
  role: ChatMessageRoleSchema,
  content: z.string(),
}).strict()

export const AgentChatContextSnapshotSchema = ChatMessageContextSnapshotMetaSchema.extend({
  order: z.number().int().nonnegative(),
  content: z.string(),
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
  memory: AgentMemoryRunOptionsSchema,
}).strict()

export type AgentChatContextMessage = z.infer<typeof AgentChatContextMessageSchema>
export type AgentChatContextSnapshot = z.infer<typeof AgentChatContextSnapshotSchema>
export type AgentChatRuntimeContext = z.infer<typeof AgentChatRuntimeContextSchema>
