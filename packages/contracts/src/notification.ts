import { z } from 'zod'
import { DocumentCollaborationPermissionSchema, DocumentCollaborationScopeSchema, DocumentCollaborationUserInviteStatusSchema } from './document/collaboration'
import { AuditUserSummarySchema } from './identity'

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

export const NotificationSummarySchema = z.object({
  pendingDocumentCollaborationUserInviteCount: z.number().int().min(0),
  pendingDocumentCollaborationUserInvites: z.array(DocumentCollaborationUserInviteNotificationSchema),
}).strict()

/**
 * 当前用户的消息提醒聚合。
 */
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>
export type DocumentCollaborationUserInviteNotification = z.infer<typeof DocumentCollaborationUserInviteNotificationSchema>
