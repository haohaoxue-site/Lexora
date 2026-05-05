import { z } from 'zod'
import {
  AiAnchorSchema,
  AiEditorWorkflowKeySchema,
} from '../ai'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AgentEditorAiRunContextSchema = z.object({
  aiSessionId: NonEmptyStringSchema,
  aiRunId: NonEmptyStringSchema,
}).strict()

export const AgentGetEditorAiContextRequestSchema = z.object({
  actorId: NonEmptyStringSchema,
  aiRunId: NonEmptyStringSchema,
}).strict()

export const AgentEditorAiContextSchema = z.object({
  sessionId: NonEmptyStringSchema,
  aiRunId: NonEmptyStringSchema,
  documentId: NonEmptyStringSchema,
  workflowKey: AiEditorWorkflowKeySchema,
  prompt: NonEmptyStringSchema,
  anchor: AiAnchorSchema,
  documentTitle: z.string(),
  documentPlainText: z.string(),
  anchorBlockPlainText: z.string(),
  baseProjectionRevision: z.number().int().nonnegative(),
  currentProjectionRevision: z.number().int().nonnegative(),
}).strict()

export type AgentEditorAiRunContext = z.infer<typeof AgentEditorAiRunContextSchema>
export type AgentGetEditorAiContextRequest = z.infer<typeof AgentGetEditorAiContextRequestSchema>
export type AgentEditorAiContext = z.infer<typeof AgentEditorAiContextSchema>
