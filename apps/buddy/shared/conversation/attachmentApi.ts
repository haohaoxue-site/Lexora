import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema, isAbsolutePath } from '../runtime/apiValidation'

export const attachmentSchema = z.object({
  attachmentId: idSchema,
  kind: z.enum(['image', 'text', 'binary']),
  mimeType: z.string().min(1),
  name: z.string().min(1),
  previewUrl: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
}).strict()

export type LocalAttachment = DeepReadonly<z.infer<typeof attachmentSchema>>

export const attachmentsRequestSchemas = {
  attachmentPreview: z.object({ attachmentId: idSchema }).strict(),
} as const

export const attachmentsResponseSchemas = {
  attachmentPreview: z.object({
    mimeType: z.string().regex(/^image\//),
    path: z.string().refine(isAbsolutePath),
  }).strict(),
  attachments: z.array(attachmentSchema),
} as const
