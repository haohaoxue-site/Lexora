import type { DocumentShareProjection } from './core'
import { z } from 'zod'
import { AuditUserSummarySchema, UserCodeSchema, UserCollabIdentitySchema } from '../identity'

import { WorkspaceTypeSchema } from '../workspace'

export const DOCUMENT_SHARE_MODE = {
  NONE: 'NONE',
  DIRECT_USER: 'DIRECT_USER',
  LOGGED_IN: 'LOGGED_IN',
  PUBLIC: 'PUBLIC',
} as const

export const DOCUMENT_SHARE_MODE_VALUES = [
  DOCUMENT_SHARE_MODE.NONE,
  DOCUMENT_SHARE_MODE.DIRECT_USER,
  DOCUMENT_SHARE_MODE.LOGGED_IN,
  DOCUMENT_SHARE_MODE.PUBLIC,
] as const

export const DOCUMENT_SHARE_MODE_LABELS = {
  [DOCUMENT_SHARE_MODE.NONE]: '不分享',
  [DOCUMENT_SHARE_MODE.DIRECT_USER]: '指定用户',
  [DOCUMENT_SHARE_MODE.LOGGED_IN]: '登录用户',
  [DOCUMENT_SHARE_MODE.PUBLIC]: '公开访问',
} as const satisfies Record<(typeof DOCUMENT_SHARE_MODE_VALUES)[number], string>

export const DOCUMENT_SHARE_MODE_ICON_NAMES = {
  [DOCUMENT_SHARE_MODE.NONE]: 'share-none',
  [DOCUMENT_SHARE_MODE.DIRECT_USER]: 'share-direct',
  [DOCUMENT_SHARE_MODE.LOGGED_IN]: 'share-public',
  [DOCUMENT_SHARE_MODE.PUBLIC]: 'share-public',
} as const satisfies Record<(typeof DOCUMENT_SHARE_MODE_VALUES)[number], string>

export const DOCUMENT_SHARE_MODE_OPTIONS = [
  {
    label: DOCUMENT_SHARE_MODE_LABELS[DOCUMENT_SHARE_MODE.NONE],
    value: DOCUMENT_SHARE_MODE.NONE,
    icon: DOCUMENT_SHARE_MODE_ICON_NAMES[DOCUMENT_SHARE_MODE.NONE],
  },
  {
    label: DOCUMENT_SHARE_MODE_LABELS[DOCUMENT_SHARE_MODE.DIRECT_USER],
    value: DOCUMENT_SHARE_MODE.DIRECT_USER,
    icon: DOCUMENT_SHARE_MODE_ICON_NAMES[DOCUMENT_SHARE_MODE.DIRECT_USER],
  },
  {
    label: DOCUMENT_SHARE_MODE_LABELS[DOCUMENT_SHARE_MODE.LOGGED_IN],
    value: DOCUMENT_SHARE_MODE.LOGGED_IN,
    icon: DOCUMENT_SHARE_MODE_ICON_NAMES[DOCUMENT_SHARE_MODE.LOGGED_IN],
  },
  {
    label: DOCUMENT_SHARE_MODE_LABELS[DOCUMENT_SHARE_MODE.PUBLIC],
    value: DOCUMENT_SHARE_MODE.PUBLIC,
    icon: DOCUMENT_SHARE_MODE_ICON_NAMES[DOCUMENT_SHARE_MODE.PUBLIC],
  },
] as const

export const DOCUMENT_SHARE_INHERIT_MODE = 'INHERIT' as const

export const DOCUMENT_SHARE_INHERIT_MODE_OPTION = {
  label: '继承父级',
  value: DOCUMENT_SHARE_INHERIT_MODE,
  icon: 'share-inherit',
} as const

export const DOCUMENT_SHARE_STATUS = {
  ACTIVE: 'ACTIVE',
  REMOVED: 'REMOVED',
} as const

export const DOCUMENT_SHARE_STATUS_VALUES = [
  DOCUMENT_SHARE_STATUS.ACTIVE,
  DOCUMENT_SHARE_STATUS.REMOVED,
] as const

export const DOCUMENT_SHARE_PERMISSION = {
  VIEW: 'VIEW',
  COMMENT: 'COMMENT',
} as const

export const DOCUMENT_SHARE_PERMISSION_VALUES = [
  DOCUMENT_SHARE_PERMISSION.VIEW,
  DOCUMENT_SHARE_PERMISSION.COMMENT,
] as const

export const DOCUMENT_SHARE_PERMISSION_LABELS = {
  [DOCUMENT_SHARE_PERMISSION.VIEW]: '可查看',
  [DOCUMENT_SHARE_PERMISSION.COMMENT]: '可评论',
} as const satisfies Record<(typeof DOCUMENT_SHARE_PERMISSION_VALUES)[number], string>

export const DOCUMENT_SHARE_RECIPIENT_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DECLINED: 'DECLINED',
  EXITED: 'EXITED',
  REMOVED: 'REMOVED',
} as const

export const DOCUMENT_SHARE_RECIPIENT_STATUS_VALUES = [
  DOCUMENT_SHARE_RECIPIENT_STATUS.PENDING,
  DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
  DOCUMENT_SHARE_RECIPIENT_STATUS.DECLINED,
  DOCUMENT_SHARE_RECIPIENT_STATUS.EXITED,
  DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
] as const

export const DOCUMENT_SHARE_ROUTE_PREFIX = '/shared'

export const DOCUMENT_COLLABORATION_ROLE = {
  MAINTAINER: 'MAINTAINER',
  EDITOR: 'EDITOR',
  COMMENTER: 'COMMENTER',
} as const

export const DOCUMENT_COLLABORATION_ROLE_VALUES = [
  DOCUMENT_COLLABORATION_ROLE.MAINTAINER,
  DOCUMENT_COLLABORATION_ROLE.EDITOR,
  DOCUMENT_COLLABORATION_ROLE.COMMENTER,
] as const

export const DocumentShareModeSchema = z.enum(DOCUMENT_SHARE_MODE_VALUES)
export const DocumentShareStatusSchema = z.enum(DOCUMENT_SHARE_STATUS_VALUES)
export const DocumentSharePermissionSchema = z.enum(DOCUMENT_SHARE_PERMISSION_VALUES)
export const DocumentShareRecipientStatusSchema = z.enum(DOCUMENT_SHARE_RECIPIENT_STATUS_VALUES)
export const DocumentCollaborationRoleSchema = z.enum(DOCUMENT_COLLABORATION_ROLE_VALUES)
export const DocumentLinkShareModeSchema = DocumentShareModeSchema.extract([
  DOCUMENT_SHARE_MODE.LOGGED_IN,
  DOCUMENT_SHARE_MODE.PUBLIC,
])

export const ConfirmDocumentShareInheritanceUnlinkSchema = z.object({
  confirmUnlinkInheritance: z.boolean().optional(),
}).strict()

export const SetDocumentLinkShareSchema = ConfirmDocumentShareInheritanceUnlinkSchema.extend({
  mode: DocumentLinkShareModeSchema,
}).strict()

export const CreateDirectDocumentShareSchema = z.object({
  userCode: UserCodeSchema.or(z.string().trim().min(1).max(32)),
  confirmUnlinkInheritance: z.boolean().optional(),
}).strict()

export const DocumentShareSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  mode: DocumentShareModeSchema,
  permission: DocumentSharePermissionSchema,
  status: DocumentShareStatusSchema,
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  createdByUser: AuditUserSummarySchema.nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
  updatedByUser: AuditUserSummarySchema.nullable(),
}).strict()

export const DocumentPublicShareSchema = DocumentShareSchema.extend({
  link: z.string(),
}).strict()

export const DocumentPublicShareInfoSchema = z.object({
  share: DocumentPublicShareSchema.nullable(),
}).strict()

export const DocumentShareRecipientSchema = z.object({
  id: z.string(),
  documentShareId: z.string(),
  recipientUserId: z.string(),
  permission: DocumentSharePermissionSchema,
  status: DocumentShareRecipientStatusSchema,
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  createdByUser: AuditUserSummarySchema.nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
  updatedByUser: AuditUserSummarySchema.nullable(),
}).strict()

const DocumentShareAccessShareSchema = DocumentShareSchema.extend({
  link: z.string().optional(),
}).strict()

export const DOCUMENT_SHARE_ACCESS_SOURCE = {
  OWNER: 'OWNER',
  WORKSPACE_MEMBER: 'WORKSPACE_MEMBER',
  DIRECT_SHARE: 'DIRECT_SHARE',
  PUBLIC_SHARE: 'PUBLIC_SHARE',
} as const

export const DOCUMENT_SHARE_ACCESS_SOURCE_VALUES = [
  DOCUMENT_SHARE_ACCESS_SOURCE.OWNER,
  DOCUMENT_SHARE_ACCESS_SOURCE.WORKSPACE_MEMBER,
  DOCUMENT_SHARE_ACCESS_SOURCE.DIRECT_SHARE,
  DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
] as const

export const DocumentShareAccessSourceSchema = z.enum(DOCUMENT_SHARE_ACCESS_SOURCE_VALUES)

export const DocumentShareRecipientSummarySchema = z.object({
  recipient: DocumentShareRecipientSchema,
  recipientUser: UserCollabIdentitySchema,
  sharedByUser: UserCollabIdentitySchema.nullable(),
  share: DocumentShareSchema,
  documentId: z.string(),
  documentTitle: z.string(),
  workspaceName: z.string(),
  workspaceType: WorkspaceTypeSchema,
  link: z.string(),
}).strict()

export const DocumentShareAccessSchema = z.object({
  accessSource: DocumentShareAccessSourceSchema,
  permission: DocumentSharePermissionSchema,
  authorizationRootDocumentId: z.string(),
  authorizationShareId: z.string().nullable(),
  authorizationRecipientId: z.string().nullable(),
  entryShareId: z.string().nullable(),
  entryRecipientId: z.string().nullable(),
  canEditTree: z.boolean(),
  share: DocumentShareAccessShareSchema,
  recipient: DocumentShareRecipientSchema.nullable(),
  recipientStatus: DocumentShareRecipientStatusSchema,
  sharedByUser: UserCollabIdentitySchema.nullable(),
  documentId: z.string(),
  documentTitle: z.string(),
  workspaceName: z.string(),
  workspaceType: WorkspaceTypeSchema,
}).strict()

export type DocumentShareMode = z.infer<typeof DocumentShareModeSchema>
export type DocumentLinkShareMode = z.infer<typeof DocumentLinkShareModeSchema>
export type DocumentCollaborationRole = z.infer<typeof DocumentCollaborationRoleSchema>
export type DocumentShareStatus = z.infer<typeof DocumentShareStatusSchema>
export type DocumentSharePermission = z.infer<typeof DocumentSharePermissionSchema>
export type DocumentShareRecipientStatus = z.infer<typeof DocumentShareRecipientStatusSchema>
export type DocumentShareAccessSource = z.infer<typeof DocumentShareAccessSourceSchema>
export type DocumentShareModeIconName = typeof DOCUMENT_SHARE_MODE_ICON_NAMES[DocumentShareMode]
export type DocumentShareInheritMode = typeof DOCUMENT_SHARE_INHERIT_MODE
export type DocumentShareDialogMode = DocumentShareMode | DocumentShareInheritMode
export type DocumentShareDialogModeIconName = DocumentShareModeIconName | typeof DOCUMENT_SHARE_INHERIT_MODE_OPTION.icon
export type CreateDirectDocumentShareRequest = z.infer<typeof CreateDirectDocumentShareSchema>
export type SetDocumentLinkShareRequest = z.infer<typeof SetDocumentLinkShareSchema>
export type DocumentShare = z.infer<typeof DocumentShareSchema>
export type DocumentPublicShare = z.infer<typeof DocumentPublicShareSchema>
export type DocumentPublicShareInfo = z.infer<typeof DocumentPublicShareInfoSchema>
export type DocumentShareRecipient = z.infer<typeof DocumentShareRecipientSchema>
export type DocumentShareRecipientSummary = z.infer<typeof DocumentShareRecipientSummarySchema>
export type DocumentShareAccess = z.infer<typeof DocumentShareAccessSchema>

/**
 * 构建分享投影所需的文档树节点。
 */
export interface DocumentShareProjectionTreeNode {
  /** 文档 ID */
  id: string
  /** 父级文档 ID */
  parentId: string | null
  /** 文档标题 */
  title: string
}

/**
 * 构建分享投影所需的本地分享策略源。
 */
export interface DocumentShareProjectionPolicySource {
  /** 分享源 ID */
  id: string
  /** 文档 ID */
  documentId: string
  /** 分享模式 */
  mode: NonNullable<DocumentShareProjection['localPolicy']>['mode']
  /** 直接分享用户数 */
  directUserCount: number
  /** 更新时间 */
  updatedAt: Date
  /** 更新人 ID */
  updatedBy: string | null
}

/**
 * 分享方式选项。
 */
export interface DocumentShareModeOption {
  /** 展示文案 */
  label: string
  /** 分享方式值 */
  value: DocumentShareDialogMode
  /** 图标名称 */
  icon: DocumentShareDialogModeIconName
}

/**
 * 分享权限选项。
 */
export interface DocumentSharePermissionOption {
  /** 展示文案 */
  label: string
  /** 分享权限值 */
  value: DocumentSharePermission
  /** 是否禁用 */
  disabled?: boolean
}
