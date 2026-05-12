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
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { ChatRunProjectorService } from './chat-run-projector.service'
import { ChatSessionsService } from './chat-sessions.service'
import {
  CreateChatCompletionRequestDto,
  UpdateChatSessionModelRequestDto,
  UpdateChatSessionTitleRequestDto,
} from './chat.dto'
import { ChatService } from './chat.service'

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatSessionsService: ChatSessionsService,
    private readonly chatRunProjectorService: ChatRunProjectorService,
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
    const {
      command,
      expectedHistoryVersion,
      nextAssistantOrder,
      sessionId,
    } = await this.chatService.prepareChatReplyCommand({
      userId: authUser.id,
      sessionId: payload.sessionId,
      content: payload.content,
    })
    const assistantMessage = await this.chatSessionsService.createAssistantPlaceholderMessage({
      sessionId,
      order: nextAssistantOrder,
      agentRunId: command.runId,
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    try {
      await this.chatRunProjectorService.projectRunToReply({
        reply,
        command,
        sessionId,
        messageId: assistantMessage.id,
        expectedHistoryVersion,
        start: async () => {
          await this.chatService.publishChatReplyCommand({
            userId: authUser.id,
            sessionId,
            command,
          })
        },
      })
    }
    finally {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end()
      }
    }
  }
}
