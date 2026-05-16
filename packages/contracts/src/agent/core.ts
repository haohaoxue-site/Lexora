import { z } from 'zod'
import {
  AI_EDITOR_WORKFLOW_KEY,
  AiProviderAuthModeSchema,
  AiProviderScopeSchema,
} from '../ai'

export const AGENT_QUEUE_NAME = {
  COMMANDS: 'samepage:agent:commands',
  CONTROLS: 'samepage:agent:controls',
  CONTROL_RESULTS: 'samepage:agent:control-results',
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
  TOOL_CALL_ARGS_DELTA: 'tool.call.args.delta',
  TOOL_CALL_COMPLETED: 'tool.call.completed',
  TOOL_RESULT: 'tool.result',
  CANDIDATE_COMPLETED: 'candidate.completed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  RUN_TIMED_OUT: 'run.timed_out',
} as const

export const AGENT_RUN_CONTROL_TYPE = {
  CANCEL_RUN: 'run.cancel',
  DELETE_CHECKPOINT_THREAD: 'checkpoint.thread.delete',
} as const

export const AGENT_RUN_CONTROL_TYPE_VALUES = [
  AGENT_RUN_CONTROL_TYPE.CANCEL_RUN,
  AGENT_RUN_CONTROL_TYPE.DELETE_CHECKPOINT_THREAD,
] as const

export const AGENT_RUN_CONTROL_RESULT_TYPE = {
  CHECKPOINT_THREAD_DELETE_COMPLETED: 'checkpoint.thread.delete.completed',
  CHECKPOINT_THREAD_DELETE_FAILED: 'checkpoint.thread.delete.failed',
} as const

export const AGENT_RUN_CONTROL_RESULT_TYPE_VALUES = [
  AGENT_RUN_CONTROL_RESULT_TYPE.CHECKPOINT_THREAD_DELETE_COMPLETED,
  AGENT_RUN_CONTROL_RESULT_TYPE.CHECKPOINT_THREAD_DELETE_FAILED,
] as const

export const AGENT_RUN_EVENT_TYPE_VALUES = [
  AGENT_RUN_EVENT_TYPE.RUN_STARTED,
  AGENT_RUN_EVENT_TYPE.TEXT_DELTA,
  AGENT_RUN_EVENT_TYPE.REASONING_DELTA,
  AGENT_RUN_EVENT_TYPE.PROGRESS,
  AGENT_RUN_EVENT_TYPE.TOOL_CALL_STARTED,
  AGENT_RUN_EVENT_TYPE.TOOL_CALL_ARGS_DELTA,
  AGENT_RUN_EVENT_TYPE.TOOL_CALL_COMPLETED,
  AGENT_RUN_EVENT_TYPE.TOOL_RESULT,
  AGENT_RUN_EVENT_TYPE.CANDIDATE_COMPLETED,
  AGENT_RUN_EVENT_TYPE.RUN_COMPLETED,
  AGENT_RUN_EVENT_TYPE.RUN_FAILED,
  AGENT_RUN_EVENT_TYPE.RUN_CANCELLED,
  AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT,
] as const

export const AgentRunEventTypeSchema = z.enum(AGENT_RUN_EVENT_TYPE_VALUES)
export const AgentRunControlTypeSchema = z.enum(AGENT_RUN_CONTROL_TYPE_VALUES)
export const AgentRunControlResultTypeSchema = z.enum(AGENT_RUN_CONTROL_RESULT_TYPE_VALUES)
export const AgentWorkflowKeySchema = z.enum(AGENT_WORKFLOW_KEY_VALUES)

const NonEmptyStringSchema = z.string().trim().min(1)
const AgentRunContextSchema = z.record(z.string(), z.unknown())
const AgentRunEventBaseSchema = z.object({
  runId: NonEmptyStringSchema,
  workflowKey: AgentWorkflowKeySchema,
})
const AgentRunTextDeltaPayloadSchema = z.object({
  text: z.string(),
}).strict()
const AgentRunFailurePayloadSchema = z.object({
  message: z.string().trim().min(1).optional(),
}).strict()

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

const AgentRunCancelControlCommandSchema = z.object({
  controlId: NonEmptyStringSchema,
  type: z.literal(AGENT_RUN_CONTROL_TYPE.CANCEL_RUN),
  runId: NonEmptyStringSchema,
  reason: z.string().trim().min(1).optional(),
}).strict()

const AgentCheckpointThreadDeleteControlCommandSchema = z.object({
  controlId: NonEmptyStringSchema,
  type: z.literal(AGENT_RUN_CONTROL_TYPE.DELETE_CHECKPOINT_THREAD),
  cleanupTaskId: NonEmptyStringSchema.optional(),
  threadId: NonEmptyStringSchema,
  reason: z.string().trim().min(1).optional(),
}).strict()

export const AgentRunControlCommandSchema = z.discriminatedUnion('type', [
  AgentRunCancelControlCommandSchema,
  AgentCheckpointThreadDeleteControlCommandSchema,
])

const AgentCheckpointThreadDeleteCompletedControlResultSchema = z.object({
  controlId: NonEmptyStringSchema,
  type: z.literal(AGENT_RUN_CONTROL_RESULT_TYPE.CHECKPOINT_THREAD_DELETE_COMPLETED),
  cleanupTaskId: NonEmptyStringSchema,
  threadId: NonEmptyStringSchema,
}).strict()

const AgentCheckpointThreadDeleteFailedControlResultSchema = z.object({
  controlId: NonEmptyStringSchema,
  type: z.literal(AGENT_RUN_CONTROL_RESULT_TYPE.CHECKPOINT_THREAD_DELETE_FAILED),
  cleanupTaskId: NonEmptyStringSchema,
  threadId: NonEmptyStringSchema,
  errorMessage: z.string().trim().min(1),
}).strict()

export const AgentRunControlResultSchema = z.discriminatedUnion('type', [
  AgentCheckpointThreadDeleteCompletedControlResultSchema,
  AgentCheckpointThreadDeleteFailedControlResultSchema,
])

export const AgentRunEventSchema = z.discriminatedUnion('type', [
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.RUN_STARTED),
    payload: z.unknown().optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.REASONING_DELTA),
    payload: AgentRunTextDeltaPayloadSchema,
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.TEXT_DELTA),
    payload: AgentRunTextDeltaPayloadSchema,
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.PROGRESS),
    payload: z.unknown().optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.TOOL_CALL_STARTED),
    payload: z.object({
      toolCallId: NonEmptyStringSchema,
      toolName: NonEmptyStringSchema,
    }).strict(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.TOOL_CALL_ARGS_DELTA),
    payload: z.object({
      toolCallId: NonEmptyStringSchema,
      text: z.string(),
    }).strict(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.TOOL_CALL_COMPLETED),
    payload: z.object({
      toolCallId: NonEmptyStringSchema,
    }).strict(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.TOOL_RESULT),
    payload: z.object({
      toolCallId: NonEmptyStringSchema,
      content: z.string(),
    }).strict(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.CANDIDATE_COMPLETED),
    payload: z.unknown().optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.RUN_COMPLETED),
    payload: z.object({
      durationMs: z.number().int().nonnegative().optional(),
    }).strict().optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.RUN_FAILED),
    payload: AgentRunFailurePayloadSchema.optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.RUN_CANCELLED),
    payload: AgentRunFailurePayloadSchema.optional(),
  }).strict(),
  AgentRunEventBaseSchema.extend({
    type: z.literal(AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT),
    payload: AgentRunFailurePayloadSchema.optional(),
  }).strict(),
])

export type AgentRunEventType = z.infer<typeof AgentRunEventTypeSchema>
export type AgentWorkflowKey = z.infer<typeof AgentWorkflowKeySchema>
export type AgentRunModelTarget = z.infer<typeof AgentRunModelTargetSchema>
export type AgentRunCommand = z.infer<typeof AgentRunCommandSchema>
export type AgentRunControlCommand = z.infer<typeof AgentRunControlCommandSchema>
export type AgentRunControlResult = z.infer<typeof AgentRunControlResultSchema>
export type AgentRunControlType = z.infer<typeof AgentRunControlTypeSchema>
export type AgentRunControlResultType = z.infer<typeof AgentRunControlResultTypeSchema>
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>
