import { z } from 'zod'
import { SYSTEM_ACTION_KINDS } from '../systemCapability'

const commonTarget = {
  allowedActions: z.array(z.enum(SYSTEM_ACTION_KINDS)),
  displayName: z.string().min(1).max(1024),
  interruption: z.enum(['application', 'network', 'none', 'service']),
}

export const processTargetSchema = z.object({
  ...commonTarget,
  kind: z.literal('process'),
  pid: z.number().int().positive(),
  executable: z.string().min(1),
  instanceId: z.string().regex(/^\d+$/),
  startedAt: z.string().min(1),
}).strict()

export const systemTargetsSchema = z.array(z.discriminatedUnion('kind', [
  processTargetSchema,
  z.object({
    ...commonTarget,
    kind: z.literal('service'),
    serviceId: z.string().min(1).max(256),
    displayId: z.string().min(1).max(256),
    scope: z.literal('system'),
    activeState: z.enum(['active', 'inactive', 'transitioning']),
  }).strict(),
])).max(4096)
