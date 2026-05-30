import type { NotificationSummary } from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'

@Injectable()
export class NotificationsService {
  async getNotificationSummary(): Promise<NotificationSummary> {
    return {
      pendingTeamInviteCount: 0,
      pendingTeamInvites: [],
    }
  }
}
