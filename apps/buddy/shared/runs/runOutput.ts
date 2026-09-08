import { z } from 'zod'

export const buddyRunOutputPayloadSchema = z.object({
  artifactIds: z.array(z.string().min(1).max(256))
    .min(1)
    .max(512),
  sourceToolCallId: z.string().min(1).max(256),
  sourceToolName: z.string().min(1).max(256),
}).strict()

export type BuddyRunOutputPayload = z.infer<typeof buddyRunOutputPayloadSchema>
