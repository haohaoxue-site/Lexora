import { z } from 'zod'
import {
  CountSchema,
  createPageDataSchema,
  RequestPageParamsSchema,
} from './common'
import { DocumentCollaborationPermissionSchema, DocumentCollaborationScopeSchema, DocumentCollaborationUserInviteStatusSchema } from './document/collaboration'
import { AuditUserSummarySchema } from './identity'
import { TiptapJsonContentPayloadSchema } from './tiptap/core'

export const NOTIFICATION_SOURCE_KIND = {
  PLATFORM: 'PLATFORM',
  DOCUMENT_COLLABORATION_USER_INVITE: 'DOCUMENT_COLLABORATION_USER_INVITE',
} as const

export const NOTIFICATION_SOURCE_KIND_VALUES = [
  NOTIFICATION_SOURCE_KIND.PLATFORM,
  NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE,
] as const

export const NOTIFICATION_LIST_FILTER = {
  ALL: 'all',
  UNREAD: 'unread',
} as const

export const NOTIFICATION_LIST_FILTER_VALUES = [
  NOTIFICATION_LIST_FILTER.ALL,
  NOTIFICATION_LIST_FILTER.UNREAD,
] as const

export const PLATFORM_NOTIFICATION_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
} as const

export const PLATFORM_NOTIFICATION_STATUS_VALUES = [
  PLATFORM_NOTIFICATION_STATUS.DRAFT,
  PLATFORM_NOTIFICATION_STATUS.PUBLISHED,
] as const

export const PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH = 60

const IsoDateTimeStringSchema = z.string().datetime()

export const NotificationSourceKindSchema = z.enum(NOTIFICATION_SOURCE_KIND_VALUES)
export const NotificationListFilterSchema = z.enum(NOTIFICATION_LIST_FILTER_VALUES)
export const PlatformNotificationStatusSchema = z.enum(PLATFORM_NOTIFICATION_STATUS_VALUES)

export const DocumentCollaborationUserInviteNotificationSchema = z.object({
  id: z.string(),
  rootDocumentId: z.string(),
  resolverCode: z.string(),
  documentTitle: z.string(),
  inviter: AuditUserSummarySchema.nullable(),
  permission: DocumentCollaborationPermissionSchema,
  scope: DocumentCollaborationScopeSchema,
  status: DocumentCollaborationUserInviteStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict()

export const NotificationSenderSchema = z.object({
  displayName: z.string().trim().min(1),
  avatarUrl: z.string().trim().min(1).nullable(),
}).strict()

const NotificationItemBaseSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  content: TiptapJsonContentPayloadSchema,
  contentText: z.string(),
  sender: NotificationSenderSchema,
  messageAt: IsoDateTimeStringSchema,
  createdAt: IsoDateTimeStringSchema,
  readAt: IsoDateTimeStringSchema.nullable(),
  isUnread: z.boolean(),
}).strict()

export const PlatformNotificationItemSchema = NotificationItemBaseSchema.extend({
  kind: z.literal(NOTIFICATION_SOURCE_KIND.PLATFORM),
}).strict()

export const DocumentCollaborationUserInviteNotificationItemSchema = NotificationItemBaseSchema.extend({
  kind: z.literal(NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE),
  documentInvite: DocumentCollaborationUserInviteNotificationSchema,
}).strict()

export const NotificationItemSchema = z.discriminatedUnion('kind', [
  PlatformNotificationItemSchema,
  DocumentCollaborationUserInviteNotificationItemSchema,
])

export const NotificationListQuerySchema = z.object({
  filter: NotificationListFilterSchema.default(NOTIFICATION_LIST_FILTER.ALL),
  cursor: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict()

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationItemSchema),
  nextCursor: z.string().trim().min(1).nullable(),
  unreadCount: CountSchema,
}).strict()

export const NotificationMarkAllReadResponseSchema = z.object({
  markedCount: CountSchema,
  unreadCount: CountSchema,
}).strict()

export const NotificationSummarySchema = z.object({
  unreadCount: CountSchema,
  pendingDocumentCollaborationUserInviteCount: z.number().int().min(0),
  pendingDocumentCollaborationUserInvites: z.array(DocumentCollaborationUserInviteNotificationSchema),
}).strict()

export const PlatformNotificationSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  content: TiptapJsonContentPayloadSchema,
  summary: z.string(),
  status: PlatformNotificationStatusSchema,
  publishedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  createdBy: z.string().trim().min(1).nullable(),
  createdByUser: AuditUserSummarySchema.nullable(),
  updatedAt: IsoDateTimeStringSchema,
  updatedBy: z.string().trim().min(1).nullable(),
  updatedByUser: AuditUserSummarySchema.nullable(),
}).strict()

export const CreatePlatformNotificationRequestSchema = z.object({
  title: z.string().trim().min(1).max(PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH),
  content: TiptapJsonContentPayloadSchema,
  status: PlatformNotificationStatusSchema.default(PLATFORM_NOTIFICATION_STATUS.DRAFT),
}).strict()

export const UpdatePlatformNotificationRequestSchema = z.object({
  title: z.string().trim().min(1).max(PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH).optional(),
  content: TiptapJsonContentPayloadSchema.optional(),
  status: PlatformNotificationStatusSchema.optional(),
}).strict()

export const GetPlatformNotificationsQuerySchema = RequestPageParamsSchema.extend({
  status: PlatformNotificationStatusSchema.optional(),
})

export const PlatformNotificationListResponseSchema = createPageDataSchema(PlatformNotificationSchema)

/**
 * 当前用户的消息提醒聚合。
 */
export type NotificationSourceKind = z.infer<typeof NotificationSourceKindSchema>
export type NotificationListFilter = z.infer<typeof NotificationListFilterSchema>
export type PlatformNotificationStatus = z.infer<typeof PlatformNotificationStatusSchema>
export type NotificationSender = z.infer<typeof NotificationSenderSchema>
export type NotificationItem = z.infer<typeof NotificationItemSchema>
export type PlatformNotificationItem = z.infer<typeof PlatformNotificationItemSchema>
export type DocumentCollaborationUserInviteNotificationItem = z.infer<typeof DocumentCollaborationUserInviteNotificationItemSchema>
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>
export type NotificationMarkAllReadResponse = z.infer<typeof NotificationMarkAllReadResponseSchema>
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>
export type DocumentCollaborationUserInviteNotification = z.infer<typeof DocumentCollaborationUserInviteNotificationSchema>
export type PlatformNotification = z.infer<typeof PlatformNotificationSchema>
export type CreatePlatformNotificationRequest = z.infer<typeof CreatePlatformNotificationRequestSchema>
export type UpdatePlatformNotificationRequest = z.infer<typeof UpdatePlatformNotificationRequestSchema>
export type GetPlatformNotificationsQuery = z.infer<typeof GetPlatformNotificationsQuerySchema>
export type PlatformNotificationListResponse = z.infer<typeof PlatformNotificationListResponseSchema>
