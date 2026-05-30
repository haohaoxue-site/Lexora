import type { NotificationSummary } from '@haohaoxue/samepage-contracts'
import { PERMISSIONS } from '@haohaoxue/samepage-contracts'
import { Controller, Get } from '@nestjs/common'
import { RequirePermissions } from '../../decorators/require-permissions.decorator'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermissions(PERMISSIONS.USER_READ_SELF)
  @Get('summary')
  async getNotificationSummary(): Promise<NotificationSummary> {
    return this.notificationsService.getNotificationSummary()
  }
}
