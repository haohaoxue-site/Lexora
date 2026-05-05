import type { NotificationSummary } from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../auth/auth.interface'
import { PERMISSIONS } from '@haohaoxue/samepage-contracts'
import { Controller, Get } from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { RequirePermissions } from '../../decorators/require-permissions.decorator'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermissions(PERMISSIONS.USER_READ_SELF)
  @Get('summary')
  async getNotificationSummary(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<NotificationSummary> {
    return this.notificationsService.getNotificationSummary(authUser.id)
  }
}
