import { z } from 'zod'
import { ChatGenerationModelTargetSnapshotSchema } from './model'
import { AgentProfileSnapshotSchema } from './profile'

const NonEmptyStringSchema = z.string().trim().min(1)

export const ChatMessageGenerationStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const ChatMessageGenerationSnapshotSchema = z.object({
  generationId: NonEmptyStringSchema,
  sessionId: NonEmptyStringSchema,
  assistantMessageId: NonEmptyStringSchema,
  triggerUserMessageId: NonEmptyStringSchema,
  actorUserId: NonEmptyStringSchema,
  agentProfileSnapshot: AgentProfileSnapshotSchema,
  modelTargetSnapshot: ChatGenerationModelTargetSnapshotSchema,
}).strict()

export type ChatMessageGenerationStatus = z.infer<typeof ChatMessageGenerationStatusSchema>
export type ChatMessageGenerationSnapshot = z.infer<typeof ChatMessageGenerationSnapshotSchema>
