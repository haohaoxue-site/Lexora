import { z } from 'zod'
import { AuditUserSummarySchema, UserCodeSchema, UserCollabIdentitySchema } from '../identity'
import {
  COLLABORATION_RESOLVER_ENTRY_STATUS_VALUES,
  COLLABORATION_RESOLVER_ENTRY_TYPE_VALUES,
  DOCUMENT_COLLABORATION_ACCESS_SOURCE_VALUES,
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE_VALUES,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_VALUES,
  DOCUMENT_COLLABORATION_GRANT_STATUS_VALUES,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE_VALUES,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX,
  DOCUMENT_COLLABORATION_PERMISSION_VALUES,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY_VALUES,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS_VALUES,
  DOCUMENT_COLLABORATION_SCOPE_VALUES,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS_VALUES,
} from './collaboration/constants'

export {
  COLLABORATION_RESOLVER_ENTRY_STATUS,
  COLLABORATION_RESOLVER_ENTRY_STATUS_VALUES,
  COLLABORATION_RESOLVER_ENTRY_TYPE,
  COLLABORATION_RESOLVER_ENTRY_TYPE_VALUES,
  DOCUMENT_COLLABORATION_ACCESS_SOURCE,
  DOCUMENT_COLLABORATION_ACCESS_SOURCE_VALUES,
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE_VALUES,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_LABELS,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_VALUES,
  DOCUMENT_COLLABORATION_GRANT_STATUS,
  DOCUMENT_COLLABORATION_GRANT_STATUS_VALUES,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE_VALUES,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX,
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_PERMISSION_LABELS,
  DOCUMENT_COLLABORATION_PERMISSION_VALUES,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY_LABELS,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY_VALUES,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS_VALUES,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_COLLABORATION_SCOPE_LABELS,
  DOCUMENT_COLLABORATION_SCOPE_VALUES,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS_VALUES,
} from './collaboration/constants'

export const DocumentCollaborationPermissionSchema = z.enum(DOCUMENT_COLLABORATION_PERMISSION_VALUES)
export const DocumentCollaborationScopeSchema = z.enum(DOCUMENT_COLLABORATION_SCOPE_VALUES)
export const DocumentCollaborationGrantSourceTypeSchema = z.enum(DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_VALUES)
export const DocumentCollaborationGrantStatusSchema = z.enum(DOCUMENT_COLLABORATION_GRANT_STATUS_VALUES)
export const DocumentCollaborationUserInviteStatusSchema = z.enum(DOCUMENT_COLLABORATION_USER_INVITE_STATUS_VALUES)
export const DocumentCollaborationAccessSourceSchema = z.enum(DOCUMENT_COLLABORATION_ACCESS_SOURCE_VALUES)
export const DocumentCollaborationCollaboratorSourceSchema = z.enum(DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE_VALUES)
export const CollaborationResolverEntryTypeSchema = z.enum(COLLABORATION_RESOLVER_ENTRY_TYPE_VALUES)
export const CollaborationResolverEntryStatusSchema = z.enum(COLLABORATION_RESOLVER_ENTRY_STATUS_VALUES)
export const DocumentCollaborationResolverStatusSchema = z.enum(DOCUMENT_COLLABORATION_RESOLVER_STATUS_VALUES)
export const DocumentCollaborationLinkInviteStateSchema = z.enum(DOCUMENT_COLLABORATION_LINK_INVITE_STATE_VALUES)
export const DocumentCollaborationRangeSummarySchema = z.enum(DOCUMENT_COLLABORATION_RANGE_SUMMARY_VALUES)
export const DocumentCollaborationLinkPasswordSchema = z
  .string()
  .trim()
  .regex(DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX, '链接密码必须是 6 位数字')

export const DocumentCollaborationCapabilitiesSchema = z.object({
  canRead: z.boolean(),
  canEdit: z.boolean(),
  canCreateChild: z.boolean(),
  canManageCollaboration: z.boolean(),
  canPublish: z.boolean(),
  canMove: z.boolean(),
  canTrash: z.boolean(),
  canRestore: z.boolean(),
}).strict()

export const DocumentCollaborationAccessSchema = z.object({
  source: DocumentCollaborationAccessSourceSchema,
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  rootDocumentId: z.string(),
  grantId: z.string().nullable(),
  capabilities: DocumentCollaborationCapabilitiesSchema,
}).strict()

export const DocumentCollaborationGrantSchema = z.object({
  id: z.string(),
  rootDocumentId: z.string(),
  userId: z.string(),
  user: UserCollabIdentitySchema,
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  sourceType: DocumentCollaborationGrantSourceTypeSchema,
  sourceId: z.string().nullable(),
  status: DocumentCollaborationGrantStatusSchema,
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
}).strict()

export const DocumentCollaborationUserInviteSchema = z.object({
  id: z.string(),
  rootDocumentId: z.string(),
  inviteeUserId: z.string(),
  inviteeUser: UserCollabIdentitySchema,
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  status: DocumentCollaborationUserInviteStatusSchema,
  resolverCode: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
}).strict()

export const DocumentCollaborationLinkInviteSchema = z.object({
  id: z.string(),
  rootDocumentId: z.string(),
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  enabled: z.boolean(),
  passwordEnabled: z.boolean(),
  password: DocumentCollaborationLinkPasswordSchema.nullable(),
  resolverCode: z.string(),
  codeTail: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
}).strict()

export const CollaborationResolverEntrySchema = z.object({
  id: z.string(),
  code: z.string(),
  type: CollaborationResolverEntryTypeSchema,
  targetId: z.string(),
  status: CollaborationResolverEntryStatusSchema,
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict()

export const DocumentCollaborationInheritedSourceSchema = z.object({
  rootDocumentId: z.string(),
  title: z.string(),
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
}).strict()

export const DocumentCollaborationCollaboratorSchema = z.object({
  userId: z.string(),
  user: UserCollabIdentitySchema,
  source: DocumentCollaborationCollaboratorSourceSchema,
  grant: DocumentCollaborationGrantSchema.nullable(),
  effectivePermission: DocumentCollaborationPermissionSchema,
  effectiveScope: DocumentCollaborationScopeSchema,
  inheritedFrom: DocumentCollaborationInheritedSourceSchema.nullable(),
  updatedAt: z.string(),
}).strict()

export const DocumentCollaborationOverviewSchema = z.object({
  rootDocumentId: z.string(),
  owner: AuditUserSummarySchema,
  directGrants: z.array(DocumentCollaborationGrantSchema),
  inheritedGrants: z.array(DocumentCollaborationGrantSchema),
  collaborators: z.array(DocumentCollaborationCollaboratorSchema),
  userInvites: z.array(DocumentCollaborationUserInviteSchema),
  linkInvite: DocumentCollaborationLinkInviteSchema.nullable(),
}).strict()

export const DocumentCollaborationConsoleLinkInviteSchema = z.object({
  id: z.string(),
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  enabled: z.boolean(),
  resolverCode: z.string(),
  codeTail: z.string().nullable(),
  updatedAt: z.string(),
}).strict()

export interface DocumentCollaborationConsoleTreeItem {
  id: string
  title: string
  parentId: string | null
  hasChildren: boolean
  collaboratorCount: number
  pendingInviteCount: number
  linkInviteState: DocumentCollaborationLinkInviteState
  linkInvite: DocumentCollaborationConsoleLinkInvite | null
  rangeSummary: DocumentCollaborationRangeSummary
  updatedAt: string
  children: DocumentCollaborationConsoleTreeItem[]
}

export const DocumentCollaborationConsoleTreeItemSchema: z.ZodType<DocumentCollaborationConsoleTreeItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    parentId: z.string().nullable(),
    hasChildren: z.boolean(),
    collaboratorCount: z.number().int().nonnegative(),
    pendingInviteCount: z.number().int().nonnegative(),
    linkInviteState: DocumentCollaborationLinkInviteStateSchema,
    linkInvite: DocumentCollaborationConsoleLinkInviteSchema.nullable(),
    rangeSummary: DocumentCollaborationRangeSummarySchema,
    updatedAt: z.string(),
    children: z.array(DocumentCollaborationConsoleTreeItemSchema),
  }).strict(),
)

export const DocumentCollaborationConsoleListResponseSchema = z.object({
  tree: z.array(DocumentCollaborationConsoleTreeItemSchema),
}).strict()

export const CreateDocumentCollaborationUserInviteSchema = z.object({
  userCode: UserCodeSchema,
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
}).strict()

export const UpdateDocumentCollaborationGrantSchema = z.object({
  permission: DocumentCollaborationPermissionSchema.optional(),
  scope: DocumentCollaborationScopeSchema.optional(),
}).strict()

export const SetDocumentCollaborationUserGrantSchema = z.object({
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
}).strict()

export const UpsertDocumentCollaborationLinkInviteSchema = z.object({
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  enabled: z.boolean().default(true),
  passwordEnabled: z.boolean().optional(),
  password: DocumentCollaborationLinkPasswordSchema.optional(),
}).strict()

export const UpsertDocumentCollaborationLinkInviteResponseSchema = z.object({
  linkInvite: DocumentCollaborationLinkInviteSchema,
  resolverCode: z.string(),
}).strict()

export const DocumentCollaborationJoinResponseSchema = z.object({
  documentId: z.string(),
  grant: DocumentCollaborationGrantSchema,
}).strict()

export const DocumentCollaborationCurrentAccessSummarySchema = z.object({
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
}).strict()

export const DocumentCollaborationResolverPreviewSchema = z.object({
  code: z.string(),
  type: CollaborationResolverEntryTypeSchema,
  status: DocumentCollaborationResolverStatusSchema,
  rootDocumentId: z.string().nullable(),
  documentTitle: z.string(),
  inviter: AuditUserSummarySchema.nullable(),
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  passwordRequired: z.boolean(),
  currentAccess: DocumentCollaborationCurrentAccessSummarySchema.nullable(),
}).strict()

export const ConfirmDocumentCollaborationResolverEntrySchema = z.object({
  password: DocumentCollaborationLinkPasswordSchema.optional(),
}).strict()

export type DocumentCollaborationPermission = z.infer<typeof DocumentCollaborationPermissionSchema>
export type DocumentCollaborationScope = z.infer<typeof DocumentCollaborationScopeSchema>
export type DocumentCollaborationGrantSourceType = z.infer<typeof DocumentCollaborationGrantSourceTypeSchema>
export type DocumentCollaborationGrantStatus = z.infer<typeof DocumentCollaborationGrantStatusSchema>
export type DocumentCollaborationUserInviteStatus = z.infer<typeof DocumentCollaborationUserInviteStatusSchema>
export type DocumentCollaborationAccessSource = z.infer<typeof DocumentCollaborationAccessSourceSchema>
export type DocumentCollaborationCollaboratorSource = z.infer<typeof DocumentCollaborationCollaboratorSourceSchema>
export type CollaborationResolverEntryType = z.infer<typeof CollaborationResolverEntryTypeSchema>
export type CollaborationResolverEntryStatus = z.infer<typeof CollaborationResolverEntryStatusSchema>
export type DocumentCollaborationResolverStatus = z.infer<typeof DocumentCollaborationResolverStatusSchema>
export type DocumentCollaborationLinkInviteState = z.infer<typeof DocumentCollaborationLinkInviteStateSchema>
export type DocumentCollaborationRangeSummary = z.infer<typeof DocumentCollaborationRangeSummarySchema>
export type DocumentCollaborationCapabilities = z.infer<typeof DocumentCollaborationCapabilitiesSchema>
export type DocumentCollaborationAccess = z.infer<typeof DocumentCollaborationAccessSchema>
export type DocumentCollaborationGrant = z.infer<typeof DocumentCollaborationGrantSchema>
export type DocumentCollaborationUserInvite = z.infer<typeof DocumentCollaborationUserInviteSchema>
export type DocumentCollaborationLinkInvite = z.infer<typeof DocumentCollaborationLinkInviteSchema>
export type CollaborationResolverEntry = z.infer<typeof CollaborationResolverEntrySchema>
export type DocumentCollaborationInheritedSource = z.infer<typeof DocumentCollaborationInheritedSourceSchema>
export type DocumentCollaborationCollaborator = z.infer<typeof DocumentCollaborationCollaboratorSchema>
export type DocumentCollaborationOverview = z.infer<typeof DocumentCollaborationOverviewSchema>
export type DocumentCollaborationConsoleLinkInvite = z.infer<typeof DocumentCollaborationConsoleLinkInviteSchema>
export type DocumentCollaborationConsoleListResponse = z.infer<typeof DocumentCollaborationConsoleListResponseSchema>
export type CreateDocumentCollaborationUserInviteRequest = z.infer<typeof CreateDocumentCollaborationUserInviteSchema>
export type UpdateDocumentCollaborationGrantRequest = z.infer<typeof UpdateDocumentCollaborationGrantSchema>
export type SetDocumentCollaborationUserGrantRequest = z.infer<typeof SetDocumentCollaborationUserGrantSchema>
export type UpsertDocumentCollaborationLinkInviteRequest = z.infer<typeof UpsertDocumentCollaborationLinkInviteSchema>
export type UpsertDocumentCollaborationLinkInviteResponse = z.infer<typeof UpsertDocumentCollaborationLinkInviteResponseSchema>
export type DocumentCollaborationJoinResponse = z.infer<typeof DocumentCollaborationJoinResponseSchema>
export type DocumentCollaborationCurrentAccessSummary = z.infer<typeof DocumentCollaborationCurrentAccessSummarySchema>
export type DocumentCollaborationResolverPreview = z.infer<typeof DocumentCollaborationResolverPreviewSchema>
export type ConfirmDocumentCollaborationResolverEntryRequest = z.infer<typeof ConfirmDocumentCollaborationResolverEntrySchema>
