import { z } from 'zod'
import { isAbsolutePath } from '../runtime/apiValidation'

export const localResourcePathSchema = z.string().min(1).max(4096).refine(value => isAbsolutePath(value) && !value.includes('\0'))

export const buddyLocalResourceSchema = z.object({
  kind: z.enum(['file', 'directory']),
  mimeType: z.string().max(255),
  name: z.string().min(1).max(255),
  path: localResourcePathSchema,
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().readonly()

export type BuddyLocalResource = z.infer<typeof buddyLocalResourceSchema>
