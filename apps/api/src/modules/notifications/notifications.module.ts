import { Module } from '@nestjs/common'
import { NotificationsAdminController } from './notifications-admin.controller'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
