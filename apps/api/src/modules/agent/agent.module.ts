import { Module } from '@nestjs/common'
import { RedisModule } from '../../infrastructure/redis/redis.module'
import { AgentRunCommandPublisherService } from './agent-command-publisher.service'
import { AgentRunEventsService } from './agent-events.service'
import { AgentRuntimeCleanupTasksService } from './agent-runtime-cleanup-tasks.service'

@Module({
  imports: [RedisModule],
  providers: [AgentRunCommandPublisherService, AgentRunEventsService, AgentRuntimeCleanupTasksService],
  exports: [AgentRunCommandPublisherService, AgentRunEventsService, AgentRuntimeCleanupTasksService],
})
export class AgentModule {}
