import type { CreateAiEditorSessionRequest } from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  AGENT_RUN_EVENT_TYPE,
  AI_EDITOR_STREAM_EVENT_TYPE,
  CreateAiEditorSessionRequestSchema,
  STREAM_DONE_PAYLOAD,
} from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { AgentRunEventsService, getAgentRunEventText } from '../../agent/agent-events.service'
import { AiEditorSessionsService } from './sessions.service'

@Controller('ai')
export class AiEditorController {
  private readonly logger = new Logger(AiEditorController.name)

  constructor(
    private readonly editorSessionsService: AiEditorSessionsService,
    private readonly agentRunEventsService: AgentRunEventsService,
  ) {}

  @Post('editor/sessions')
  async createEditorSession(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(CreateAiEditorSessionRequestSchema))
    payload: CreateAiEditorSessionRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const eventStreamStartId = await this.agentRunEventsService.getLatestEventStreamId()
    const {
      command,
      run,
      session,
    } = await this.editorSessionsService.submitEditorRunCommand({
      userId: authUser.id,
      request: payload,
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    reply.raw.write(`data: ${JSON.stringify({
      type: AI_EDITOR_STREAM_EVENT_TYPE.SESSION_CREATED,
      session,
      run,
    })}\n\n`)

    let contentText = ''

    try {
      await this.agentRunEventsService.consumeRunEvents({
        runId: command.runId,
        workflowKey: command.workflowKey,
        afterId: eventStreamStartId,
        messages: {
          aborted: '编辑器 AI 请求已取消',
          cancelled: '编辑器 AI 运行已取消',
          timedOut: '等待编辑器 AI 运行结果超时',
          failed: '编辑器 AI 运行失败',
        },
        onEvent: (event) => {
          if (event.type !== AGENT_RUN_EVENT_TYPE.TEXT_DELTA) {
            return
          }

          const chunk = getAgentRunEventText(event)
          if (!chunk) {
            return
          }

          contentText += chunk
          reply.raw.write(`data: ${JSON.stringify({
            type: AI_EDITOR_STREAM_EVENT_TYPE.TEXT_DELTA,
            content: chunk,
          })}\n\n`)
        },
      })

      const candidate = await this.editorSessionsService.completeEditorRunWithCandidate({
        userId: authUser.id,
        sessionId: session.sessionId,
        runId: run.runId,
        contentText,
      })

      reply.raw.write(`data: ${JSON.stringify({
        type: AI_EDITOR_STREAM_EVENT_TYPE.CANDIDATE_COMPLETED,
        candidate,
      })}\n\n`)
      reply.raw.write(`data: ${STREAM_DONE_PAYLOAD}\n\n`)
    }
    catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '编辑器 AI 流式响应失败'

      try {
        await this.editorSessionsService.markEditorRunFailed({
          userId: authUser.id,
          sessionId: session.sessionId,
          runId: run.runId,
        })
      }
      catch (statusError) {
        this.logger.error(
          statusError instanceof Error ? statusError.message : 'mark editor ai run failed',
          statusError instanceof Error ? statusError.stack : undefined,
        )
      }
      this.logger.error(
        error instanceof Error ? error.message : 'editor ai stream failed',
        error instanceof Error ? error.stack : undefined,
      )
      reply.raw.write(`data: ${JSON.stringify({
        type: AI_EDITOR_STREAM_EVENT_TYPE.ERROR,
        message,
      })}\n\n`)
    }
    finally {
      reply.raw.end()
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('editor/sessions/:sessionId/candidates/:candidateId/accept')
  acceptEditorCandidate(
    @CurrentUser() authUser: AuthUserContext,
    @Param('sessionId') sessionId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.editorSessionsService.acceptEditorCandidate({
      userId: authUser.id,
      sessionId,
      candidateId,
    })
  }

  @HttpCode(HttpStatus.OK)
  @Post('editor/sessions/:sessionId/candidates/:candidateId/reject')
  rejectEditorCandidate(
    @CurrentUser() authUser: AuthUserContext,
    @Param('sessionId') sessionId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.editorSessionsService.rejectEditorCandidate({
      userId: authUser.id,
      sessionId,
      candidateId,
    })
  }
}
