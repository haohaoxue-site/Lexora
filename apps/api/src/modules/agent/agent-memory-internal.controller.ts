import type {
  RetrieveAgentMemoryRequest,
  RetrieveAgentMemoryResponse,
} from '@haohaoxue/samepage-contracts'
import { RetrieveAgentMemoryRequestSchema } from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common'
import { Public } from '../../decorators/public.decorator'
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe'
import { AgentMemoryService } from './agent-memory.service'

@Controller('internal/agent/memory')
export class AgentMemoryInternalController {
  constructor(private readonly memories: AgentMemoryService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('retrieve')
  retrieveMemories(
    @Body(new ZodValidationPipe(RetrieveAgentMemoryRequestSchema)) payload: RetrieveAgentMemoryRequest,
  ): Promise<RetrieveAgentMemoryResponse> {
    return this.memories.retrieveMemoriesForAgent(payload)
  }
}
