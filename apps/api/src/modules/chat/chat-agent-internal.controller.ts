import type { ChatGenerationBootstrap } from '@haohaoxue/samepage-contracts'
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { Public } from '../../decorators/public.decorator'
import { ChatSessionsService } from './chat-sessions.service'

@Controller('internal/chat')
export class ChatAgentInternalController {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('generations/:generationId/bootstrap')
  async getChatGenerationBootstrap(
    @Param('generationId') generationId: string,
  ): Promise<ChatGenerationBootstrap> {
    return this.chatSessionsService.getAgentGenerationBootstrap({
      generationId,
    })
  }
}
