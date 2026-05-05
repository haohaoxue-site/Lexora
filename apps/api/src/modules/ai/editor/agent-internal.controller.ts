import type {
  AgentEditorAiContext,
  AgentGetEditorAiContextRequest,
} from '@haohaoxue/samepage-contracts'
import { AgentGetEditorAiContextRequestSchema } from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { AiEditorSessionsService } from './sessions.service'

@Controller('internal/ai/editor')
export class AiEditorAgentInternalController {
  constructor(private readonly editorSessionsService: AiEditorSessionsService) {}

  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('sessions/:id/context')
  async getEditorAiContext(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(AgentGetEditorAiContextRequestSchema))
    payload: AgentGetEditorAiContextRequest,
  ): Promise<AgentEditorAiContext> {
    return this.editorSessionsService.getAgentEditorContext({
      actorId: payload.actorId,
      sessionId,
      aiRunId: payload.aiRunId,
    })
  }
}
