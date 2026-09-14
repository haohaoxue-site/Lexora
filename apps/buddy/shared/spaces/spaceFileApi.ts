import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { directoryPageSchema, fileEntrySchema, filePreviewSchema } from '../files/filePreview'
import { idSchema } from '../runtime/apiValidation'

export const spaceFileTargetSchema = z.object({
  spaceId: idSchema,
  directoryId: idSchema,
  revision: z.number().int().positive(),
  path: z.string().max(4096),
}).strict()

export const spaceFileEntrySchema = fileEntrySchema
export const spaceDirectoryPageSchema = directoryPageSchema
export const spaceFilePreviewSchema = filePreviewSchema

export const spaceFileLocationSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['directory', 'file']),
}).strict()

export type SpaceFileTarget = z.infer<typeof spaceFileTargetSchema>
export type LocalSpaceFileEntry = DeepReadonly<z.infer<typeof spaceFileEntrySchema>>
export type LocalSpaceDirectoryPage = DeepReadonly<z.infer<typeof spaceDirectoryPageSchema>>
export type LocalSpaceFilePreview = DeepReadonly<z.infer<typeof spaceFilePreviewSchema>>
export type SpaceDirectoryRequest = z.infer<typeof spaceDirectoryRequestSchema>

export const spaceDirectoryRequestSchema = spaceFileTargetSchema.extend({ cursor: z.string().max(512).optional() }).strict()

export const spaceFilesRpc = {
  list: { method: 'spaceFiles.list', input: spaceDirectoryRequestSchema, response: spaceDirectoryPageSchema },
  read: { method: 'spaceFiles.read', input: spaceFileTargetSchema, response: spaceFilePreviewSchema },
  locate: { method: 'spaceFiles.locate', input: spaceFileTargetSchema, response: spaceFileLocationSchema },
} as const satisfies Record<string, RuntimeRequestContract>
