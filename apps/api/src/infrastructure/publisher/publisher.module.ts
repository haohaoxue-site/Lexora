import { Module } from '@nestjs/common'
import { RedisModule } from '../redis/redis.module'
import { CollabPermissionInvalidationPublisherService } from './collab-permission-invalidation-publisher.service'

@Module({
  imports: [RedisModule],
  providers: [CollabPermissionInvalidationPublisherService],
  exports: [CollabPermissionInvalidationPublisherService],
})
export class PublisherModule {}
