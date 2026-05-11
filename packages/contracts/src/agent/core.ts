import { z } from 'zod'
import {
  AI_EDITOR_WORKFLOW_KEY,
  AiProviderAuthModeSchema,
  AiProviderScopeSchema,
} from '../ai'

export const AGENT_QUEUE_NAME = {
  COMMANDS: 'samepage:agent:commands',
  EVENTS: 'samepage:agent:events',
  DEAD_LETTER: 'samepage:agent:commands:dead-letter',
} as const

export const AGENT_WORKFLOW_KEY = {
  CHAT_REPLY: 'chat.reply',
  EDITOR_GENERATE: AI_EDITOR_WORKFLOW_KEY.GENERATE,
  EDITOR_REWRITE: AI_EDITOR_WORKFLOW_KEY.REWRITE,
} as const

export const AGENT_WORKFLOW_KEY_VALUES = [
  AGENT_WORKFLOW_KEY.CHAT_REPLY,
  AGENT_WORKFLOW_KEY.EDITOR_GENERATE,
  AGENT_WORKFLOW_KEY.EDITOR_REWRITE,
] as const

export const AGENT_RUN_EVENT_TYPE = {
  RUN_STARTED: 'run.started',
  TEXT_DELTA: 'text.delta',
  REASONING_DELTA: 'reasoning.delta',
  PROGRESS: 'progress',
  TOOL_CALL_STARTED: 'tool.call.started',
  TOOL_CALL_COMPLETED: 'tool.call.completed',
  CANDIDATE_COMPLETED: 'candidate.completed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  RUN_TIMED_OUT: 'run.timed_out',
} as const

export const AGENT_RUN_EVENT_TYPE_VALUES = [
  AGENT_RUN_EVENT_TYPE.RUN_STARTED,
  AGENT_RUN_EVENT_TYPE.TEXT_DELTA,
  AGENT_RUN_EVENT_TYPE.REASONING_DELTA,
  AGENT_RUN_EVENT_TYPE.PROGRESS,
  AGENT_RUN_EVENT_TYPE.TOOL_CALL_STARTED,
  AGENT_RUN_EVENT_TYPE.TOOL_CALL_COMPLETED,
  AGENT_RUN_EVENT_TYPE.CANDIDATE_COMPLETED,
  AGENT_RUN_EVENT_TYPE.RUN_COMPLETED,
  AGENT_RUN_EVENT_TYPE.RUN_FAILED,
  AGENT_RUN_EVENT_TYPE.RUN_CANCELLED,
  AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT,
] as const

export const AgentRunEventTypeSchema = z.enum(AGENT_RUN_EVENT_TYPE_VALUES)
export const AgentWorkflowKeySchema = z.enum(AGENT_WORKFLOW_KEY_VALUES)

const NonEmptyStringSchema = z.string().trim().min(1)
const AgentRunContextSchema = z.record(z.string(), z.unknown())

export const AgentRunModelTargetSchema = z.object({
  providerId: NonEmptyStringSchema,
  scope: AiProviderScopeSchema,
  providerKey: NonEmptyStringSchema,
  adapterKey: NonEmptyStringSchema,
  endpoint: NonEmptyStringSchema,
  apiKey: NonEmptyStringSchema.nullable(),
  authMode: AiProviderAuthModeSchema,
  modelId: NonEmptyStringSchema,
}).strict()

export const AgentRunCommandSchema = z.object({
  commandId: NonEmptyStringSchema,
  runId: NonEmptyStringSchema,
  workflowKey: AgentWorkflowKeySchema,
  actorId: NonEmptyStringSchema,
  modelTarget: AgentRunModelTargetSchema.nullable(),
  context: AgentRunContextSchema.default({}),
  idempotencyKey: NonEmptyStringSchema,
  payload: z.unknown().optional(),
}).strict()

export const AgentRunEventSchema = z.object({
  type: AgentRunEventTypeSchema,
  runId: NonEmptyStringSchema,
  workflowKey: AgentWorkflowKeySchema,
  payload: z.unknown().optional(),
}).strict()

export type AgentRunEventType = z.infer<typeof AgentRunEventTypeSchema>
export type AgentWorkflowKey = z.infer<typeof AgentWorkflowKeySchema>
export type AgentRunModelTarget = z.infer<typeof AgentRunModelTargetSchema>
export type AgentRunCommand = z.infer<typeof AgentRunCommandSchema>
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>
