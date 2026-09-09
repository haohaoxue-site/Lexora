import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema } from '../runtime/apiValidation'

export const spaceFileTargetSchema = z.object({
  spaceId: idSchema,
  directoryId: idSchema,
  revision: z.number().int().positive(),
  path: z.string().max(4096),
}).strict()

export const spaceFileEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(['directory', 'file']),
  unavailable: z.boolean(),
}).strict()

export const spaceDirectoryPageSchema = z.object({
  entries: z.array(spaceFileEntrySchema).max(250),
  nextCursor: z.string().nullable(),
}).strict()

export const spaceFilePreviewSchema = z.object({
  kind: z.enum(['text', 'image', 'binary', 'oversized']),
  sizeBytes: z.number().int().nonnegative(),
  text: z.string().max(1024 * 1024).nullable(),
  imageUrl: z.string().max(12 * 1024 * 1024).nullable(),
}).strict()

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
