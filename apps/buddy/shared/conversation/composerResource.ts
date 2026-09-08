import { z } from 'zod'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
} from './attachmentPolicy'
import { buddyResourceIdSchema } from './buddyUserContent'

export const buddyComposerResourceMetadataSchema = z.object({
  mimeType: z.string().trim().max(255),
  name: z.string().trim().min(1).max(255),
  resourceId: buddyResourceIdSchema,
  sizeBytes: z.number().int().nonnegative().max(BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT),
}).strict()

const resourceBaseSchema = buddyComposerResourceMetadataSchema.extend({
  draftId: buddyResourceIdSchema,
  kind: z.enum(['image', 'text']),
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

export const buddyArtifactSourceSchema = z.object({
  artifactId: buddyResourceIdSchema,
  branchId: buddyResourceIdSchema,
  conversationId: buddyResourceIdSchema,
}).strict()

export const buddyArtifactOriginSchema = buddyArtifactSourceSchema

export const buddyComposerSourceOriginSchema = z.union([
  buddySpaceFileOriginSchema,
  buddyMessageInputOriginSchema,
  buddyArtifactOriginSchema,
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
  resources: z.array(buddyComposerResourceMetadataSchema).min(1).max(BUDDY_ATTACHMENT_COUNT_LIMIT),
}).strict().refine(
  value => new Set(value.resources.map(resource => resource.resourceId)).size === value.resources.length
    && value.resources.reduce((total, resource) => total + resource.sizeBytes, 0) <= BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
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
])

export const buddyComposerSourceListSchema = z.object({
  branchId: buddyResourceIdSchema.nullable(),
  conversationId: buddyResourceIdSchema.nullable(),
  draftId: buddyResourceIdSchema,
  query: z.string().trim().max(512),
  spaceId: buddyResourceIdSchema.nullable(),
}).strict()

export const buddyComposerSourceSelectSchema = buddyComposerResourceTargetSchema.extend({
  source: buddyComposerSourceSchema,
}).strict()

export const buddyComposerSourceOptionSchema = z.object({
  category: z.enum(['artifact', 'history', 'space']),
  description: z.string().nullable(),
  label: z.string().min(1).max(255),
  mimeType: z.string().max(255),
  name: z.string().min(1).max(255),
  path: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().max(BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT),
  source: buddyComposerSourceSchema,
}).strict()

export const buddyComposerSourceListResponseSchema = z.object({
  files: z.array(buddyComposerSourceOptionSchema).max(128),
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
export type BuddyArtifactSource = z.infer<typeof buddyArtifactSourceSchema>
export type BuddyArtifactOrigin = z.infer<typeof buddyArtifactOriginSchema>
export type BuddyComposerSource = z.infer<typeof buddyComposerSourceSchema>
export type BuddyComposerSourceOrigin = z.infer<typeof buddyComposerSourceOriginSchema>
export type BuddyComposerSourceList = z.infer<typeof buddyComposerSourceListSchema>
export type BuddyComposerSourceSelect = z.infer<typeof buddyComposerSourceSelectSchema>
export type BuddyComposerSourceOption = z.infer<typeof buddyComposerSourceOptionSchema>
export type BuddyComposerSourceListResponse = z.infer<typeof buddyComposerSourceListResponseSchema>
export type BuddyComposerSpaceFileSelect = z.infer<typeof buddyComposerSpaceFileSelectSchema>
