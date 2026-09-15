import { z } from 'zod'
import { isAbsolutePath } from '../runtime/apiValidation'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
} from './attachmentPolicy'
import { buddyResourceIdSchema } from './buddyUserContent'
import { buddyLocalResourceSchema, localResourcePathSchema } from './localResource'

export const buddyComposerResourceMetadataSchema = z.object({
  mimeType: z.string().trim().max(255),
  name: z.string().trim().min(1).max(255),
  nameSource: z.enum(['file', 'clipboard']).optional(),
  sourcePath: z.string().min(1).max(4096).refine(value => isAbsolutePath(value) && !value.includes('\0')).optional(),
  resourceId: buddyResourceIdSchema,
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()

const resourceBaseSchema = buddyComposerResourceMetadataSchema.extend({
  draftId: buddyResourceIdSchema,
  kind: z.enum(['image', 'pdf', 'audio', 'video', 'text', 'binary', 'directory']),
  localReference: buddyLocalResourceSchema.optional(),
})

export const buddySpaceFileSourceSchema = z.object({
  bindingId: buddyResourceIdSchema,
  relativePath: z.string().min(1).max(4096),
  spaceId: buddyResourceIdSchema,
}).strict()

export const buddySpaceFileOriginSchema = buddySpaceFileSourceSchema.extend({
  bindingRevision: z.number().int().positive(),
}).strict()

export const buddyMessageInputSourceSchema = z.object({
  attachmentId: buddyResourceIdSchema,
  branchId: buddyResourceIdSchema,
  conversationId: buddyResourceIdSchema,
  messageId: buddyResourceIdSchema,
}).strict()

export const buddyMessageInputOriginSchema = buddyMessageInputSourceSchema

export const buddyMessageResourceSourceSchema = buddyMessageInputSourceSchema.omit({ attachmentId: true }).extend({
  resourceId: buddyResourceIdSchema,
}).strict()

export const buddyLocalPathSourceSchema = z.object({ localPath: localResourcePathSchema }).strict()

export const buddyArtifactSourceSchema = z.object({
  artifactId: buddyResourceIdSchema,
  branchId: buddyResourceIdSchema,
  conversationId: buddyResourceIdSchema,
}).strict()

export const buddyArtifactOriginSchema = buddyArtifactSourceSchema

export const buddyLocalResourceOriginSchema = z.object({
  localReference: buddyLocalResourceSchema,
  origin: z.union([buddySpaceFileOriginSchema, buddyArtifactOriginSchema, buddyMessageResourceSourceSchema]).optional(),
}).strict()

export const buddyComposerSourceOriginSchema = z.union([
  buddySpaceFileOriginSchema,
  buddyMessageInputOriginSchema,
  buddyArtifactOriginSchema,
  buddyLocalResourceOriginSchema,
])

export const buddyComposerResourceSchema = z.union([
  resourceBaseSchema.extend({ state: z.literal('importing') }).strict(),
  resourceBaseSchema.extend({
    attachmentId: buddyResourceIdSchema,
    previewUrl: z.string().nullable(),
    state: z.literal('ready'),
  }).strict(),
  resourceBaseSchema.extend({
    previewUrl: z.null(),
    source: buddyComposerSourceOriginSchema,
    state: z.literal('ready'),
  }).strict(),
  resourceBaseSchema.extend({
    errorCode: z.enum(['IMPORT_FAILED', 'IMPORT_INTERRUPTED']),
    state: z.literal('failed'),
  }).strict(),
])

export const buddyComposerResourceAcceptSchema = z.object({
  draftId: buddyResourceIdSchema,
  resources: z.array(buddyComposerResourceMetadataSchema.extend({
    storage: z.enum(['reference', 'snapshot']).optional(),
  }).strict()).min(1).max(BUDDY_ATTACHMENT_COUNT_LIMIT),
}).strict().refine(
  value => new Set(value.resources.map(resource => resource.resourceId)).size === value.resources.length
    && value.resources.every(resource => resource.storage !== 'reference' || resource.sourcePath !== undefined)
    && value.resources.reduce((total, resource) => total + (resource.storage === 'reference' ? 0 : resource.sizeBytes), 0) <= BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
)

export const buddyComposerResourceTargetSchema = z.object({
  draftId: buddyResourceIdSchema,
  resourceId: buddyResourceIdSchema,
}).strict()

export const buddyComposerSpaceFileSelectSchema = buddyComposerResourceTargetSchema.extend({
  source: buddySpaceFileSourceSchema,
}).strict()

export const buddyComposerSourceSchema = z.union([
  buddySpaceFileSourceSchema,
  buddyMessageInputSourceSchema,
  buddyArtifactSourceSchema,
  buddyLocalPathSourceSchema,
  buddyMessageResourceSourceSchema,
])

export const buddyComposerSourceListSchema = z.object({
  branchId: buddyResourceIdSchema.nullable(),
  conversationId: buddyResourceIdSchema.nullable(),
  draftId: buddyResourceIdSchema,
  query: z.string().trim().max(512),
  deepSearch: z.boolean().optional(),
  spaceId: buddyResourceIdSchema.nullable(),
}).strict()

export const buddyComposerSourceSelectSchema = buddyComposerResourceTargetSchema.extend({
  source: buddyComposerSourceSchema,
}).strict()

export const buddyComposerSourceOptionSchema = z.object({
  category: z.enum(['artifact', 'history', 'space', 'external']),
  description: z.string().nullable(),
  label: z.string().min(1).max(255),
  mimeType: z.string().max(255),
  name: z.string().min(1).max(255),
  nameSource: z.enum(['file', 'clipboard']).optional(),
  history: z.object({
    messageNumber: z.number().int().positive(),
    createdAt: z.string(),
  }).strict().optional(),
  path: z.string().nullable(),
  kind: z.enum(['file', 'directory']).optional(),
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  source: buddyComposerSourceSchema,
}).strict()

export const buddyComposerDirectorySchema = z.object({
  workingDirectory: z.string().optional(),
  path: z.string(),
  query: z.string().optional(),
  status: z.enum(['ready', 'missing', 'unavailable']),
  hasMore: z.boolean(),
}).strict()

export type BuddyComposerDirectory = z.infer<typeof buddyComposerDirectorySchema>

export const buddyComposerSourceListResponseSchema = z.object({
  files: z.array(buddyComposerSourceOptionSchema).max(128),
  directory: buddyComposerDirectorySchema.optional(),
}).strict()

export const buddyComposerResourceCompleteSchema = buddyComposerResourceTargetSchema.extend({
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT),
}).strict()

export type BuddyComposerResource = z.infer<typeof buddyComposerResourceSchema>
export type BuddyComposerResourceMetadata = z.infer<typeof buddyComposerResourceMetadataSchema>
export type BuddyComposerResourceAccept = z.infer<typeof buddyComposerResourceAcceptSchema>
export type BuddyComposerResourceTarget = z.infer<typeof buddyComposerResourceTargetSchema>
export type BuddyComposerResourceComplete = z.infer<typeof buddyComposerResourceCompleteSchema>
export type BuddySpaceFileSource = z.infer<typeof buddySpaceFileSourceSchema>
export type BuddySpaceFileOrigin = z.infer<typeof buddySpaceFileOriginSchema>
export type BuddyMessageInputSource = z.infer<typeof buddyMessageInputSourceSchema>
export type BuddyMessageInputOrigin = z.infer<typeof buddyMessageInputOriginSchema>
export type BuddyMessageResourceSource = z.infer<typeof buddyMessageResourceSourceSchema>
export type BuddyLocalResourceOrigin = z.infer<typeof buddyLocalResourceOriginSchema>
export type BuddyArtifactSource = z.infer<typeof buddyArtifactSourceSchema>
export type BuddyArtifactOrigin = z.infer<typeof buddyArtifactOriginSchema>
export type BuddyComposerSource = z.infer<typeof buddyComposerSourceSchema>
export type BuddyComposerSourceOrigin = z.infer<typeof buddyComposerSourceOriginSchema>
export type BuddyComposerSourceList = z.infer<typeof buddyComposerSourceListSchema>
export type BuddyComposerSourceSelect = z.infer<typeof buddyComposerSourceSelectSchema>
export type BuddyComposerSourceOption = z.infer<typeof buddyComposerSourceOptionSchema>
export type BuddyComposerSourceListResponse = z.infer<typeof buddyComposerSourceListResponseSchema>
export type BuddyComposerSpaceFileSelect = z.infer<typeof buddyComposerSpaceFileSelectSchema>
