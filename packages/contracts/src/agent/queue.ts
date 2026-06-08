import { z } from 'zod'

const NonEmptyStringSchema = z.string().trim().min(1)

export const AgentGenerationCommandSchema = z.object({
  generationId: NonEmptyStringSchema,
  commandId: NonEmptyStringSchema,
  idempotencyKey: NonEmptyStringSchema,
  attempt: z.number().int().nonnegative().default(0),
}).strict()

export type AgentGenerationCommand = z.infer<typeof AgentGenerationCommandSchema>
