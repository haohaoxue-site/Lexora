import { Module } from '@nestjs/common'
import { RedisModule } from '../../infrastructure/redis/redis.module'
import { AgentCommandPublisherService } from './agent-command-publisher.service'
import { AgentGenerationEventsService } from './agent-events.service'
import { AgentProfilesService } from './agent-profiles.service'
import { AgentRuntimeCleanupTasksService } from './agent-runtime-cleanup-tasks.service'

@Module({
  imports: [RedisModule],
  providers: [AgentCommandPublisherService, AgentGenerationEventsService, AgentProfilesService, AgentRuntimeCleanupTasksService],
  exports: [AgentCommandPublisherService, AgentGenerationEventsService, AgentProfilesService, AgentRuntimeCleanupTasksService],
})
export class AgentModule {}
