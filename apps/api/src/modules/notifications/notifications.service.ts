import type { NotificationSummary } from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { TeamWorkspaceInvitesService } from '../workspaces/team-workspace-invites.service'

@Injectable()
export class NotificationsService {
  constructor(
    private readonly teamWorkspaceInvitesService: TeamWorkspaceInvitesService,
  ) {}

  async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    const pendingTeamInvites = await this.teamWorkspaceInvitesService.listPendingWorkspaceInvitesForInvitee(userId)

    return {
      pendingTeamInviteCount: pendingTeamInvites.length,
      pendingTeamInvites,
    }
  }
}
