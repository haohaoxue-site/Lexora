import type {
  AgentGenerationCommand,
  AgentRuntimeControlCommand,
} from '@haohaoxue/samepage-contracts'
import {
  AGENT_QUEUE_NAME,
  AgentGenerationCommandSchema,
  AgentRuntimeControlCommandSchema,
} from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { RedisService } from '../../infrastructure/redis/redis.service'

@Injectable()
export class AgentCommandPublisherService {
  constructor(private readonly redisService: RedisService) {}

  async publishGenerationCommand(command: AgentGenerationCommand): Promise<void> {
    const normalizedCommand = AgentGenerationCommandSchema.parse(command)

    await this.redisService.getClient().xadd(
      AGENT_QUEUE_NAME.COMMANDS,
      '*',
      'command',
      JSON.stringify(normalizedCommand),
    )
  }

  async publishRuntimeControl(control: AgentRuntimeControlCommand): Promise<void> {
    const normalizedControl = AgentRuntimeControlCommandSchema.parse(control)

    await this.redisService.getClient().xadd(
      AGENT_QUEUE_NAME.CONTROLS,
      '*',
      'control',
      JSON.stringify(normalizedControl),
    )
  }
}
