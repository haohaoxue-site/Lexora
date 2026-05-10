import { z } from 'zod'
import { AuditUserSummarySchema } from '../identity'
import { TiptapJsonContentPayloadSchema, TiptapSchemaVersionSchema } from '../tiptap/core'
import { DocumentShareModeSchema } from './share'

export const DOCUMENT_COLLECTION = {
  PERSONAL: 'personal',
  COLLABORATION: 'collaboration',
  SHARE: 'share',
  TEAM: 'team',
} as const

export const DOCUMENT_COLLECTION_VALUES = [
  DOCUMENT_COLLECTION.PERSONAL,
  DOCUMENT_COLLECTION.COLLABORATION,
  DOCUMENT_COLLECTION.SHARE,
  DOCUMENT_COLLECTION.TEAM,
] as const

export const DOCUMENT_TREE_COLLECTION_VALUES = [
  DOCUMENT_COLLECTION.PERSONAL,
  DOCUMENT_COLLECTION.COLLABORATION,
  DOCUMENT_COLLECTION.TEAM,
] as const

export const DOCUMENT_COLLECTION_LABELS = {
  [DOCUMENT_COLLECTION.PERSONAL]: '私有',
  [DOCUMENT_COLLECTION.COLLABORATION]: '共享给我',
  [DOCUMENT_COLLECTION.SHARE]: '分享给我',
  [DOCUMENT_COLLECTION.TEAM]: '团队',
} as const satisfies Record<(typeof DOCUMENT_COLLECTION_VALUES)[number], string>

export const DOCUMENT_TITLE_MAX_LENGTH = 120
export const DOCUMENT_DEFAULT_TITLE = '新文档'

export const DOCUMENT_SAVE_STATE = {
  IDLE: 'idle',
  DIRTY: 'dirty',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
} as const

export const DOCUMENT_VISIBILITY = {
  PRIVATE: 'PRIVATE',
  WORKSPACE: 'WORKSPACE',
} as const

export const DOCUMENT_VISIBILITY_VALUES = [
  DOCUMENT_VISIBILITY.PRIVATE,
  DOCUMENT_VISIBILITY.WORKSPACE,
] as const

export const DOCUMENT_PANE_STATE = {
  READY: 'ready',
  LOADING: 'loading',
  EMPTY: 'empty',
  UNSELECTED: 'unselected',
  UNSUPPORTED_SCHEMA: 'unsupported-schema',
  NOT_FOUND: 'not-found',
  FORBIDDEN: 'forbidden',
  ERROR: 'error',
} as const

export const DocumentStatusSchema = z.enum(['ACTIVE', 'LOCKED'])
export const DocumentVisibilitySchema = z.enum(DOCUMENT_VISIBILITY_VALUES)

export const DocumentCollectionIdSchema = z.enum(DOCUMENT_COLLECTION_VALUES)
export const DocumentTreeCollectionIdSchema = z.enum(DOCUMENT_TREE_COLLECTION_VALUES)

export const DocumentShareLocalPolicySchema = z.object({
  mode: DocumentShareModeSchema,
  shareId: z.string(),
  directUserCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
}).strict()

export const DocumentShareEffectivePolicySchema = z.object({
  mode: DocumentShareModeSchema,
  shareId: z.string(),
  rootDocumentId: z.string(),
  rootDocumentTitle: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
}).strict()

export const DocumentShareProjectionSchema = z.object({
  localPolicy: DocumentShareLocalPolicySchema.nullable(),
  effectivePolicy: DocumentShareEffectivePolicySchema.nullable(),
}).strict()

export const DocumentBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DocumentRecentSchema = z.object({
  id: z.string(),
  title: z.string(),
  collection: DocumentCollectionIdSchema,
  ancestorTitles: z.string().array(),
  link: z.string(),
  share: DocumentShareProjectionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DocumentTrashItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  collection: DocumentCollectionIdSchema,
  ancestorTitles: z.string().array(),
  trashedAt: z.string(),
}).strict()

export const DocumentItemSchema = DocumentBaseSchema.extend({
  parentId: z.string().nullable(),
  share: DocumentShareProjectionSchema.nullable(),
  hasChildren: z.boolean(),
  hasContent: z.boolean(),
  get children() {
    return z.array(DocumentItemSchema)
  },
})

export const DocumentTreeGroupSchema = z.object({
  id: DocumentTreeCollectionIdSchema,
  nodes: DocumentItemSchema.array(),
})

export const DocumentRevisionSchema = z.number().int().min(0)

export const DOCUMENT_VERSION_SNAPSHOT_SOURCE = {
  INITIAL: 'initial',
  USER: 'user',
  RESTORE: 'restore',
} as const

export const DOCUMENT_VERSION_SNAPSHOT_SOURCE_VALUES = [
  DOCUMENT_VERSION_SNAPSHOT_SOURCE.INITIAL,
  DOCUMENT_VERSION_SNAPSHOT_SOURCE.USER,
  DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE,
] as const

export const DocumentVersionSnapshotSourceSchema = z.enum(DOCUMENT_VERSION_SNAPSHOT_SOURCE_VALUES)

export const DocumentAssetKindSchema = z.enum(['image', 'file'])

export const DocumentAssetStatusSchema = z.enum(['pending', 'ready', 'deleted'])

export const DocumentRecordSchema = DocumentBaseSchema.omit({
  title: true,
}).extend({
  workspaceId: z.string(),
  createdBy: z.string(),
  visibility: DocumentVisibilitySchema,
  parentId: z.string().nullable(),
  currentProjectionId: z.string().nullable(),
  currentProjectionRevision: DocumentRevisionSchema,
  latestVersionSnapshotId: z.string().nullable(),
  order: z.number().int(),
  status: DocumentStatusSchema,
  share: DocumentShareProjectionSchema.nullable(),
}).strict()

export const DocumentCurrentProjectionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  projectionRevision: DocumentRevisionSchema,
  runtimeEpoch: z.number().int().min(1),
  projectedUpdateSeq: z.number().int().min(0),
  checkpointSeq: z.number().int().min(0),
  checkpointUpdateSeq: z.number().int().min(0),
  schemaVersion: TiptapSchemaVersionSchema,
  title: TiptapJsonContentPayloadSchema,
  body: TiptapJsonContentPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict()

export const DocumentVersionSnapshotSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  version: DocumentRevisionSchema,
  basedOnProjectionRevision: DocumentRevisionSchema,
  runtimeEpoch: z.number().int().min(1),
  schemaVersion: TiptapSchemaVersionSchema,
  title: TiptapJsonContentPayloadSchema,
  body: TiptapJsonContentPayloadSchema,
  source: DocumentVersionSnapshotSourceSchema,
  restoredFromVersionSnapshotId: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  createdByUser: AuditUserSummarySchema.nullable(),
}).strict()

export const DocumentCurrentSchema = z.object({
  document: DocumentRecordSchema,
  currentProjection: DocumentCurrentProjectionSchema,
}).strict()

export const DocumentAssetSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  kind: DocumentAssetKindSchema,
  status: DocumentAssetStatusSchema,
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  fileName: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  contentUrl: z.string().nullable(),
  createdAt: z.string(),
}).strict()

export const CreateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH).default(DOCUMENT_DEFAULT_TITLE),
  workspaceId: z.string().trim().min(1),
  visibility: DocumentVisibilitySchema.optional(),
  parentId: z.string().trim().nullable().optional(),
}).strict()

export const CreateDocumentResponseSchema = z.object({
  id: z.string().trim().min(1),
}).strict()

export const CreateDocumentVersionSnapshotSchema = z.object({
  basedOnProjectionRevision: DocumentRevisionSchema,
  source: DocumentVersionSnapshotSourceSchema.default(DOCUMENT_VERSION_SNAPSHOT_SOURCE.USER),
}).strict()

export const CreateDocumentVersionSnapshotResponseSchema = z.object({
  snapshot: DocumentVersionSnapshotSchema,
  latestVersionSnapshotId: z.string(),
}).strict()

export const ResolveDocumentAssetsSchema = z.object({
  assetIds: z.string().array(),
}).strict()

export const ResolveDocumentAssetsResponseSchema = z.object({
  assets: DocumentAssetSchema.array(),
  unresolvedAssetIds: z.string().array(),
}).strict()

export const RestoreDocumentVersionSnapshotSchema = z.object({
  baseProjectionRevision: DocumentRevisionSchema,
  versionSnapshotId: z.string().trim().min(1),
}).strict()

export const RestoreDocumentVersionSnapshotResponseSchema = z.object({
  current: DocumentCurrentSchema,
  snapshot: DocumentVersionSnapshotSchema,
}).strict()

export const PatchDocumentMetaSchema = z.object({
  parentId: z.string().trim().nullable().optional(),
  visibility: DocumentVisibilitySchema.optional(),
}).strict().refine(
  input => input.parentId !== undefined || input.visibility !== undefined,
  {
    message: '至少更新一个元数据字段',
  },
)

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>
export type DocumentVisibility = z.infer<typeof DocumentVisibilitySchema>
export type DocumentAssetKind = z.infer<typeof DocumentAssetKindSchema>
export type DocumentAssetStatus = z.infer<typeof DocumentAssetStatusSchema>
export type DocumentCollectionId = z.infer<typeof DocumentCollectionIdSchema>
export type DocumentTreeCollectionId = z.infer<typeof DocumentTreeCollectionIdSchema>
export type OwnedDocumentCollectionId = Exclude<DocumentTreeCollectionId, 'collaboration'>
export type DocumentPaneState = (typeof DOCUMENT_PANE_STATE)[keyof typeof DOCUMENT_PANE_STATE]
export type DocumentSaveState = (typeof DOCUMENT_SAVE_STATE)[keyof typeof DOCUMENT_SAVE_STATE]
export type DocumentShareLocalPolicy = z.infer<typeof DocumentShareLocalPolicySchema>
export type DocumentShareEffectivePolicy = z.infer<typeof DocumentShareEffectivePolicySchema>
export type DocumentBase = z.infer<typeof DocumentBaseSchema>
export type DocumentRecent = z.infer<typeof DocumentRecentSchema>
export type DocumentTrashItem = z.infer<typeof DocumentTrashItemSchema>
export type DocumentItem = z.infer<typeof DocumentItemSchema>
export type DocumentTreeGroup = z.infer<typeof DocumentTreeGroupSchema>
export type DocumentRevision = z.infer<typeof DocumentRevisionSchema>
export type DocumentShareProjection = z.infer<typeof DocumentShareProjectionSchema>
export type DocumentVersionSnapshotSource = z.infer<typeof DocumentVersionSnapshotSourceSchema>
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>
export type DocumentCurrentProjection = z.infer<typeof DocumentCurrentProjectionSchema>
export type DocumentVersionSnapshot = z.infer<typeof DocumentVersionSnapshotSchema>
export type DocumentCurrent = z.infer<typeof DocumentCurrentSchema>
export type DocumentAsset = z.infer<typeof DocumentAssetSchema>
export type DocumentBlockHeadingLevel = 1 | 2 | 3 | 4 | 5

/**
 * 文档块索引条目。
 */
export interface DocumentBlockIndexEntry {
  /** 块 ID */
  blockId: string
  /** 父块 ID */
  parentBlockId: string | null
  /** 嵌套深度 */
  depth: number
  /** 节点类型 */
  nodeType: string
  /** 纯文本投影 */
  plainText: string
  /** 标题层级 */
  headingLevel: DocumentBlockHeadingLevel | null
}

/**
 * 文档大纲条目。
 */
export interface DocumentOutlineItem {
  /** 块 ID */
  blockId: string
  /** 标题文本 */
  plainText: string
  /** 标题层级 */
  headingLevel: DocumentBlockHeadingLevel
}

export type CreateDocumentRequest = z.infer<typeof CreateDocumentSchema>
export type CreateDocumentResponse = z.infer<typeof CreateDocumentResponseSchema>
export type CreateDocumentVersionSnapshotRequest = z.infer<typeof CreateDocumentVersionSnapshotSchema>
export type CreateDocumentVersionSnapshotResponse = z.infer<typeof CreateDocumentVersionSnapshotResponseSchema>
export type RestoreDocumentVersionSnapshotRequest = z.infer<typeof RestoreDocumentVersionSnapshotSchema>
export type RestoreDocumentVersionSnapshotResponse = z.infer<typeof RestoreDocumentVersionSnapshotResponseSchema>
export type PatchDocumentMetaRequest = z.infer<typeof PatchDocumentMetaSchema>
export type ResolveDocumentAssetsRequest = z.infer<typeof ResolveDocumentAssetsSchema>
export type ResolveDocumentAssetsResponse = z.infer<typeof ResolveDocumentAssetsResponseSchema>
