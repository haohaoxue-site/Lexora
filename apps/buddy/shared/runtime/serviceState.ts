import type { DeepReadonly } from './apiValidation'
import { z } from 'zod'
import { buddyServiceSupervisorFailureCodeSchema } from './runtimeProtocol'

export const runtimeStateSchema = z.object({
  lastError: buddyServiceSupervisorFailureCodeSchema.nullable(),
  pid: z.number().int().positive().nullable(),
  restartAttempt: z.number().int().nonnegative(),
  status: z.enum(['stopped', 'starting', 'ready', 'restarting', 'offline', 'stopping']),
}).strict()

export type LocalBuddyServiceSupervisorState = DeepReadonly<z.infer<typeof runtimeStateSchema>>

export const runtimeResponseSchemas = {
  runtimeState: runtimeStateSchema,
} as const
