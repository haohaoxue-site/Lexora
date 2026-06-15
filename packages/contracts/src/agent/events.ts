import { z } from 'zod'
import { ChatGenerationUsageSnapshotSchema } from './generation'
import { ChatMemoryOperationProjectionSchema } from './memory'

const NonEmptyStringSchema = z.string().trim().min(1)

const TextDeltaPayloadSchema = z.object({
  text: z.string(),
}).strict()

export const AgentToolCallKindSchema = z.enum(['function', 'skill', 'mcp'])
export const AgentToolCallStatusSchema = z.enum([
  'input_streaming',
  'input_available',
  'running',
  'success',
  'error',
  'requires_action',
  'pending_confirmation',
])

const GenerationEventBaseSchema = z.object({
  generationId: NonEmptyStringSchema,
})

const ToolCallEventBasePayloadSchema = z.object({
  toolCallId: NonEmptyStringSchema,
  toolName: NonEmptyStringSchema.optional(),
  toolKind: AgentToolCallKindSchema.default('function'),
}).strict()

const ToolCallArgumentsPayloadSchema = ToolCallEventBasePayloadSchema.extend({
  arguments: z.unknown().optional(),
  argumentsText: z.string().optional(),
}).strict()

const ToolExecutionResultPayloadSchema = ToolCallEventBasePayloadSchema.extend({
  status: z.enum(['success', 'error']).default('success'),
  output: z.unknown().optional(),
  outputText: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
}).strict()

export const ChatGenerationEventSchema = z.discriminatedUnion('type', [
  GenerationEventBaseSchema.extend({
    type: z.literal('generation.started'),
    payload: z.record(z.string(), z.unknown()).default({}),
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('model.reasoning.delta'),
    payload: TextDeltaPayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('model.text.delta'),
    payload: TextDeltaPayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('model.tool.call.started'),
    payload: ToolCallEventBasePayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('model.tool.call.args.delta'),
    payload: z.object({
      toolCallId: NonEmptyStringSchema,
      text: z.string(),
    }).strict(),
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('model.tool.call.completed'),
    payload: ToolCallEventBasePayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('tool.execution.started'),
    payload: ToolCallArgumentsPayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('tool.execution.completed'),
    payload: ToolExecutionResultPayloadSchema,
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('tool.execution.failed'),
    payload: ToolCallEventBasePayloadSchema.extend({
      message: z.string().trim().min(1),
      durationMs: z.number().int().nonnegative().optional(),
    }).strict(),
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('generation.completed'),
    payload: z.object({
      durationMs: z.number().int().nonnegative().optional(),
      usage: ChatGenerationUsageSnapshotSchema.optional(),
      memoryOperations: z.array(ChatMemoryOperationProjectionSchema).default([]),
    }).strict().default({ memoryOperations: [] }),
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('generation.failed'),
    payload: z.object({
      message: z.string().trim().min(1).optional(),
    }).strict().default({}),
  }).strict(),
  GenerationEventBaseSchema.extend({
    type: z.literal('generation.cancelled'),
    payload: z.object({
      message: z.string().trim().min(1).optional(),
    }).strict().default({}),
  }).strict(),
])

export type AgentToolCallKind = z.infer<typeof AgentToolCallKindSchema>
export type AgentToolCallStatus = z.infer<typeof AgentToolCallStatusSchema>
export type ChatGenerationEvent = z.infer<typeof ChatGenerationEventSchema>
