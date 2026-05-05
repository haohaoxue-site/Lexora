import { z } from 'zod'
import { WorkspaceInviteSummarySchema } from './workspace'

export const NotificationSummarySchema = z.object({
  pendingTeamInviteCount: z.number().int().min(0),
  pendingTeamInvites: z.array(WorkspaceInviteSummarySchema),
}).strict()

/**
 * 当前用户的消息提醒聚合。
 */
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>
