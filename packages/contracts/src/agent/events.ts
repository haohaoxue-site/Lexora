import { z } from 'zod'
import { ChatGenerationUsageSnapshotSchema } from './generation'
import { ChatMemoryOperationProjectionSchema } from './memory'

const NonEmptyStringSchema = z.string().trim().min(1)

const TextDeltaPayloadSchema = z.object({
  text: z.string(),
}).strict()

const GenerationEventBaseSchema = z.object({
  generationId: NonEmptyStringSchema,
})

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

export type ChatGenerationEvent = z.infer<typeof ChatGenerationEventSchema>
