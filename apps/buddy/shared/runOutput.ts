import { z } from 'zod'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from './attachmentPolicy'

export const buddyRunOutputPayloadSchema = z.object({
  artifactIds: z.array(z.string().min(1).max(256))
    .min(1)
    .max(BUDDY_ATTACHMENT_COUNT_LIMIT),
  sourceToolCallId: z.string().min(1).max(256),
  sourceToolName: z.string().min(1).max(256),
}).strict()

export type BuddyRunOutputPayload = z.infer<typeof buddyRunOutputPayloadSchema>
