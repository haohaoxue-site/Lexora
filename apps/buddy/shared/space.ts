import { z } from 'zod'

const idSchema = z.string().trim().min(1).max(256)

const directoryBindingSchema = z.object({
  id: idSchema,
  revision: z.number().int().positive(),
}).strict()

export const spaceExecutionContextSchema = z.object({
  additionalDirectoryBindings: z.array(directoryBindingSchema).max(32),
  primaryDirectoryBinding: directoryBindingSchema.nullable(),
  spaceId: idSchema,
}).strict().superRefine((context, refinement) => {
  const directoryIds = [
    ...(context.primaryDirectoryBinding ? [context.primaryDirectoryBinding.id] : []),
    ...context.additionalDirectoryBindings.map(binding => binding.id),
  ]
  if (directoryIds.length > 32) {
    refinement.addIssue({
      code: 'custom',
      path: ['additionalDirectoryBindings'],
    })
  }
  if (new Set(directoryIds).size !== directoryIds.length) {
    refinement.addIssue({
      code: 'custom',
      path: ['additionalDirectoryBindings'],
    })
  }
})

export type SpaceExecutionContext = z.infer<typeof spaceExecutionContextSchema>
