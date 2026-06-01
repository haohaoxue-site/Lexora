import { z } from 'zod'
import { AuditUserSummarySchema, UserCodeSchema, UserCollabIdentitySchema } from '../identity'

export const DOCUMENT_COLLABORATION_PERMISSION = {
  READ: 'READ',
  EDIT: 'EDIT',
} as const

export const DOCUMENT_COLLABORATION_PERMISSION_VALUES = [
  DOCUMENT_COLLABORATION_PERMISSION.READ,
  DOCUMENT_COLLABORATION_PERMISSION.EDIT,
] as const

export const DOCUMENT_COLLABORATION_PERMISSION_LABELS = {
  [DOCUMENT_COLLABORATION_PERMISSION.READ]: '可阅读',
  [DOCUMENT_COLLABORATION_PERMISSION.EDIT]: '可编辑',
} as const satisfies Record<(typeof DOCUMENT_COLLABORATION_PERMISSION_VALUES)[number], string>

export const DOCUMENT_COLLABORATION_SCOPE = {
  SELF: 'SELF',
  DESCENDANTS: 'DESCENDANTS',
} as const

export const DOCUMENT_COLLABORATION_SCOPE_VALUES = [
  DOCUMENT_COLLABORATION_SCOPE.SELF,
  DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
] as const

export const DOCUMENT_COLLABORATION_SCOPE_LABELS = {
  [DOCUMENT_COLLABORATION_SCOPE.SELF]: '仅当前页面',
  [DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS]: '当前页面及子页面',
} as const satisfies Record<(typeof DOCUMENT_COLLABORATION_SCOPE_VALUES)[number], string>

export const DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE = {
  USER_INVITE: 'USER_INVITE',
  LINK_INVITE: 'LINK_INVITE',
  MANUAL: 'MANUAL',
} as const

export const DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_VALUES = [
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.USER_INVITE,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.LINK_INVITE,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.MANUAL,
] as const

export const DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_LABELS = {
  [DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.USER_INVITE]: '指定用户邀请',
  [DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.LINK_INVITE]: '链接邀请',
  [DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.MANUAL]: '手动授权',
} as const satisfies Record<(typeof DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE_VALUES)[number], string>

export const DOCUMENT_COLLABORATION_GRANT_STATUS = {
  ACTIVE: 'ACTIVE',
  REMOVED: 'REMOVED',
} as const

export const DOCUMENT_COLLABORATION_GRANT_STATUS_VALUES = [
  DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
  DOCUMENT_COLLABORATION_GRANT_STATUS.REMOVED,
] as const

export const DOCUMENT_COLLABORATION_USER_INVITE_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  CANCELED: 'CANCELED',
} as const

export const DOCUMENT_COLLABORATION_USER_INVITE_STATUS_VALUES = [
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS.ACCEPTED,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS.DECLINED,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS.CANCELED,
] as const

export const DOCUMENT_COLLABORATION_ACCESS_SOURCE = {
  OWNER: 'OWNER',
  WORKSPACE: 'WORKSPACE',
  GRANT: 'GRANT',
} as const

export const DOCUMENT_COLLABORATION_ACCESS_SOURCE_VALUES = [
  DOCUMENT_COLLABORATION_ACCESS_SOURCE.OWNER,
  DOCUMENT_COLLABORATION_ACCESS_SOURCE.WORKSPACE,
  DOCUMENT_COLLABORATION_ACCESS_SOURCE.GRANT,
] as const

export const DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE = {
  DIRECT: 'DIRECT',
  INHERITED: 'INHERITED',
} as const

export const DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE_VALUES = [
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT,
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.INHERITED,
] as const

export const COLLABORATION_RESOLVER_ENTRY_TYPE = {
  DOCUMENT_USER_INVITE: 'DOCUMENT_USER_INVITE',
  DOCUMENT_LINK_INVITE: 'DOCUMENT_LINK_INVITE',
} as const

export const COLLABORATION_RESOLVER_ENTRY_TYPE_VALUES = [
  COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
  COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
] as const

export const COLLABORATION_RESOLVER_ENTRY_STATUS = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const

export const COLLABORATION_RESOLVER_ENTRY_STATUS_VALUES = [
  COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
  COLLABORATION_RESOLVER_ENTRY_STATUS.REVOKED,
] as const

export const DOCUMENT_COLLABORATION_RESOLVER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  CANCELED: 'CANCELED',
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
} as const

export const DOCUMENT_COLLABORATION_RESOLVER_STATUS_VALUES = [
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.PENDING,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.ACCEPTED,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.DECLINED,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.CANCELED,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.ENABLED,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS.DISABLED,
] as const

export const DOCUMENT_COLLABORATION_LINK_INVITE_STATE = {
  NONE: 'NONE',
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
} as const

export const DOCUMENT_COLLABORATION_LINK_INVITE_STATE_VALUES = [
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE.NONE,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE.DISABLED,
] as const

export const DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS = {
  [DOCUMENT_COLLABORATION_LINK_INVITE_STATE.NONE]: '未开启',
  [DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED]: '已开启',
  [DOCUMENT_COLLABORATION_LINK_INVITE_STATE.DISABLED]: '已关闭',
} as const satisfies Record<(typeof DOCUMENT_COLLABORATION_LINK_INVITE_STATE_VALUES)[number], string>

export const DOCUMENT_COLLABORATION_RANGE_SUMMARY = {
  NONE: 'NONE',
  SELF: 'SELF',
  DESCENDANTS: 'DESCENDANTS',
  MIXED: 'MIXED',
} as const

export const DOCUMENT_COLLABORATION_RANGE_SUMMARY_VALUES = [
  DOCUMENT_COLLABORATION_RANGE_SUMMARY.NONE,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY.SELF,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY.DESCENDANTS,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY.MIXED,
] as const

export const DOCUMENT_COLLABORATION_RANGE_SUMMARY_LABELS = {
  [DOCUMENT_COLLABORATION_RANGE_SUMMARY.NONE]: '未配置',
  [DOCUMENT_COLLABORATION_RANGE_SUMMARY.SELF]: '仅当前页面',
  [DOCUMENT_COLLABORATION_RANGE_SUMMARY.DESCENDANTS]: '含子页面',
  [DOCUMENT_COLLABORATION_RANGE_SUMMARY.MIXED]: '混合',
} as const satisfies Record<(typeof DOCUMENT_COLLABORATION_RANGE_SUMMARY_VALUES)[number], string>

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
export const DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH = 6
export const DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX = /^\d{6}$/
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

export const DocumentCollaborationConsoleRootDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
}).strict()

export const DocumentCollaborationConsoleItemSchema = z.object({
  rootDocument: DocumentCollaborationConsoleRootDocumentSchema,
  collaboratorCount: z.number().int().nonnegative(),
  pendingInviteCount: z.number().int().nonnegative(),
  linkInviteState: DocumentCollaborationLinkInviteStateSchema,
  rangeSummary: DocumentCollaborationRangeSummarySchema,
  updatedAt: z.string(),
}).strict()

export const DocumentCollaborationConsoleListResponseSchema = z.object({
  items: z.array(DocumentCollaborationConsoleItemSchema),
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

export const DocumentCollaborationCurrentGrantSummarySchema = z.object({
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
  currentGrant: DocumentCollaborationCurrentGrantSummarySchema.nullable(),
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
export type DocumentCollaborationConsoleRootDocument = z.infer<typeof DocumentCollaborationConsoleRootDocumentSchema>
export type DocumentCollaborationConsoleItem = z.infer<typeof DocumentCollaborationConsoleItemSchema>
export type DocumentCollaborationConsoleListResponse = z.infer<typeof DocumentCollaborationConsoleListResponseSchema>
export type CreateDocumentCollaborationUserInviteRequest = z.infer<typeof CreateDocumentCollaborationUserInviteSchema>
export type UpdateDocumentCollaborationGrantRequest = z.infer<typeof UpdateDocumentCollaborationGrantSchema>
export type SetDocumentCollaborationUserGrantRequest = z.infer<typeof SetDocumentCollaborationUserGrantSchema>
export type UpsertDocumentCollaborationLinkInviteRequest = z.infer<typeof UpsertDocumentCollaborationLinkInviteSchema>
export type UpsertDocumentCollaborationLinkInviteResponse = z.infer<typeof UpsertDocumentCollaborationLinkInviteResponseSchema>
export type DocumentCollaborationJoinResponse = z.infer<typeof DocumentCollaborationJoinResponseSchema>
export type DocumentCollaborationCurrentGrantSummary = z.infer<typeof DocumentCollaborationCurrentGrantSummarySchema>
export type DocumentCollaborationResolverPreview = z.infer<typeof DocumentCollaborationResolverPreviewSchema>
export type ConfirmDocumentCollaborationResolverEntryRequest = z.infer<typeof ConfirmDocumentCollaborationResolverEntrySchema>
