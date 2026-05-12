import type {
  AgentGetChatSessionContextRequest,
  AgentGetChatSessionContextResponse,
} from '@haohaoxue/samepage-contracts'
import {
  AgentGetChatSessionContextRequestSchema,
} from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { Public } from '../../decorators/public.decorator'
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe'
import { ChatSessionsService } from './chat-sessions.service'

@Controller('internal/chat')
export class ChatAgentInternalController {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sessions/:id/context')
  async getChatSessionContext(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(AgentGetChatSessionContextRequestSchema))
    payload: AgentGetChatSessionContextRequest,
  ): Promise<AgentGetChatSessionContextResponse> {
    return this.chatSessionsService.getAgentSessionContext({
      actorId: payload.actorId,
      sessionId,
      triggerUserMessageId: payload.triggerUserMessageId,
    })
  }
}
