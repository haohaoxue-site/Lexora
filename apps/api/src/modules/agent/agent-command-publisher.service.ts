import type { AgentRunCommand, AgentRunControlCommand } from '@haohaoxue/samepage-contracts'
import {
  AGENT_QUEUE_NAME,
  AgentRunCommandSchema,
  AgentRunControlCommandSchema,
} from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { RedisService } from '../../infrastructure/redis/redis.service'

@Injectable()
export class AgentRunCommandPublisherService {
  constructor(private readonly redisService: RedisService) {}

  async publishRunCommand(command: AgentRunCommand): Promise<void> {
    const normalizedCommand = AgentRunCommandSchema.parse(command)

    await this.redisService.getClient().xadd(
      AGENT_QUEUE_NAME.COMMANDS,
      '*',
      'command',
      JSON.stringify(normalizedCommand),
    )
  }

  async publishRunControl(control: AgentRunControlCommand): Promise<void> {
    const normalizedControl = AgentRunControlCommandSchema.parse(control)

    await this.redisService.getClient().xadd(
      AGENT_QUEUE_NAME.CONTROLS,
      '*',
      'control',
      JSON.stringify(normalizedControl),
    )
  }
}
