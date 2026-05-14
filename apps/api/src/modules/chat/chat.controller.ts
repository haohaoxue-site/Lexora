import type {
  ChatModelListResponse,
  ChatMutationResponse,
  ChatRuntimeConfig,
  ChatSessionDetail,
  ChatSessionEvent,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import type { AuthUserContext } from '../auth/auth.interface'
import { sleep } from '@haohaoxue/samepage-shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import { CurrentUser } from '../../decorators/current-user.decorator'
import { ChatSessionEventsService } from './chat-session-events.service'
import { ChatSessionsService } from './chat-sessions.service'
import {
  CreateChatSessionMessageRequestDto,
  EditAndSendChatMessageRequestDto,
  SwitchChatActiveMessageRequestDto,
  UpdateChatSessionModelRequestDto,
  UpdateChatSessionTitleRequestDto,
} from './chat.dto'
import { ChatService } from './chat.service'

const SESSION_EVENT_POLL_INTERVAL_MS = 1000

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatSessionsService: ChatSessionsService,
    private readonly chatSessionEvents: ChatSessionEventsService,
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

  @Post('sessions/:id/messages')
  async sendMessage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Body() payload: CreateChatSessionMessageRequestDto,
  ): Promise<ChatMutationResponse> {
    return this.chatService.sendMessage({
      userId: authUser.id,
      sessionId,
      content: payload.content,
    })
  }

  @Post('sessions/:id/messages/:messageId/edit-and-send')
  async editAndSendMessage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Param('messageId') messageId: string,
    @Body() payload: EditAndSendChatMessageRequestDto,
  ): Promise<ChatMutationResponse> {
    return this.chatService.editAndSendMessage({
      userId: authUser.id,
      sessionId,
      messageId,
      content: payload.content,
    })
  }

  @Post('sessions/:id/messages/:messageId/retry')
  async retryAssistantMessage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Param('messageId') messageId: string,
  ): Promise<ChatMutationResponse> {
    return this.chatService.retryAssistantMessage({
      userId: authUser.id,
      sessionId,
      messageId,
    })
  }

  @Patch('sessions/:id/active-message')
  async switchActiveMessage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Body() payload: SwitchChatActiveMessageRequestDto,
  ): Promise<ChatMutationResponse> {
    return this.chatService.switchActiveMessage({
      userId: authUser.id,
      sessionId,
      messageId: payload.messageId,
    })
  }

  @Post('runs/:runId/cancel')
  async cancelRun(
    @CurrentUser() authUser: AuthUserContext,
    @Param('runId') runId: string,
  ): Promise<ChatMutationResponse> {
    return this.chatService.cancelRun({
      userId: authUser.id,
      runId,
    })
  }

  @Get('sessions/:id/events')
  async streamSessionEvents(
    @CurrentUser() authUser: AuthUserContext,
    @Param('id') sessionId: string,
    @Query('afterSequence') afterSequence: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.chatSessionsService.getSession(authUser.id, sessionId)

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    let cursor = parseAfterSequence(afterSequence)
    const minimumSequence = await this.chatSessionEvents.getMinimumSequence(sessionId)
    const latestSequence = await this.chatSessionEvents.getLatestSequence(sessionId)

    if (cursor === null || (minimumSequence !== null && cursor < minimumSequence - 1)) {
      writeSessionEvent(reply, this.chatSessionEvents.createSnapshotRequiredEvent({
        sessionId,
        latestSequence,
      }))
      cursor = latestSequence
    }

    try {
      while (isReplyWritable(reply)) {
        const events = await this.chatSessionEvents.getEventsAfter(sessionId, cursor)

        for (const event of events) {
          if (!isReplyWritable(reply)) {
            return
          }

          writeSessionEvent(reply, event)
          cursor = event.sequence
        }

        await sleep(SESSION_EVENT_POLL_INTERVAL_MS)
      }
    }
    finally {
      if (isReplyWritable(reply)) {
        reply.raw.end()
      }
    }
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
}

function parseAfterSequence(value: string | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const sequence = Number(value)
  return Number.isInteger(sequence) && sequence >= 0 ? sequence : null
}

function writeSessionEvent(reply: FastifyReply, event: ChatSessionEvent): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

function isReplyWritable(reply: FastifyReply): boolean {
  return !reply.raw.destroyed && !reply.raw.writableEnded
}
