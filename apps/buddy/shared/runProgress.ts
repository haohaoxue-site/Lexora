import { z } from 'zod'

export const buddyRunProgressSchema = z.object({
  phase: z.enum([
    'idle',
    'model_requesting',
    'model_streaming',
    'preparing',
    'awaiting_approval',
    'tool_executing',
  ]),
  toolName: z.string().min(1).max(256).nullable(),
}).strict()

export type BuddyRunProgress = z.infer<typeof buddyRunProgressSchema>
