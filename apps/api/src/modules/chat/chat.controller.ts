import type {
  ChatModelListResponse,
  ChatRuntimeConfig,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import type { AuthUserContext } from '../auth/auth.interface'
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { AgentRunEventsService } from '../agent/agent-events.service'
import { ChatSessionsService } from './chat-sessions.service'
import {
  CreateChatCompletionRequestDto,
  UpdateChatSessionModelRequestDto,
  UpdateChatSessionTitleRequestDto,
} from './chat.dto'
import { ChatService } from './chat.service'

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name)

  constructor(
    private readonly chatService: ChatService,
    private readonly chatSessionsService: ChatSessionsService,
    private readonly agentEventsService: AgentRunEventsService,
  ) {}

  @Get('sessions')
  async getSessions(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<ChatSessionSummary[]> {
    return this.chatSessionsService.getSessions(authUser.id)
  }

  @Post('sessions')
  async createSession(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<ChatSessionDetail> {
    return this.chatSessionsService.createSession(authUser.id)
  }

  @Get('sessions/:id')
  async getSession(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
  ): Promise<ChatSessionDetail> {
    return this.chatSessionsService.getSession(authUser.id, sessionId)
  }

  @Delete('sessions/:id')
  async deleteSession(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
  ): Promise<null> {
    await this.chatSessionsService.deleteSession(authUser.id, sessionId)
    return null
  }

  @Patch('sessions/:id/model')
  async updateSessionModel(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Body() payload: UpdateChatSessionModelRequestDto,
  ): Promise<ChatSessionDetail> {
    return this.chatService.updateSessionModel({
      userId: authUser.id,
      sessionId,
      modelRef: payload.modelRef ?? null,
    })
  }

  @Patch('sessions/:id/title')
  async updateSessionTitle(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Body() payload: UpdateChatSessionTitleRequestDto,
  ): Promise<ChatSessionDetail> {
    return this.chatSessionsService.updateSessionTitle({
      userId: authUser.id,
      sessionId,
      title: payload.title,
    })
  }

  @Get('config')
  async getRuntimeConfig(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<ChatRuntimeConfig> {
    return this.chatService.getRuntimeConfig(authUser.id)
  }

  @Get('models')
  async getModels(
    @CurrentUser() authUser: AuthUserContext,
  ): Promise<ChatModelListResponse> {
    return {
      models: await this.chatService.getModels(authUser.id),
    }
  }

  @Post('completions')
  async createCompletion(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: CreateChatCompletionRequestDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const eventStreamStartId = await this.agentEventsService.getLatestEventStreamId()
    const {
      command,
      expectedHistoryVersion,
      nextAssistantOrder,
      sessionId,
    } = await this.chatService.submitChatReplyCommand({
      userId: authUser.id,
      sessionId: payload.sessionId,
      content: payload.content,
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    let assistantContent = ''

    try {
      await this.agentEventsService.consumeRunEvents({
        runId: command.runId,
        workflowKey: command.workflowKey,
        afterId: eventStreamStartId,
        messages: {
          aborted: '聊天请求已取消',
          cancelled: '聊天运行已取消',
          timedOut: '等待聊天运行结果超时',
          failed: '聊天运行失败',
        },
        onTextDelta: (chunk) => {
          assistantContent += chunk
          reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
        },
      })

      await this.chatSessionsService.persistAssistantMessage({
        sessionId,
        assistantContent,
        order: nextAssistantOrder,
        expectedHistoryVersion,
      })
      reply.raw.write('data: [DONE]\n\n')
    }
    catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '聊天流式响应失败'

      this.logger.error(
        error instanceof Error ? error.message : 'chat completion stream failed',
        error instanceof Error ? error.stack : undefined,
      )
      reply.raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    }
    finally {
      reply.raw.end()
    }
  }
}
