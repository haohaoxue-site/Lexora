import { Module } from '@nestjs/common'
import { RedisModule } from '../../infrastructure/redis/redis.module'
import { AgentRunCommandPublisherService } from './agent-command-publisher.service'
import { AgentRunEventsService } from './agent-events.service'

@Module({
  imports: [RedisModule],
  providers: [AgentRunCommandPublisherService, AgentRunEventsService],
  exports: [AgentRunCommandPublisherService, AgentRunEventsService],
})
export class AgentModule {}
