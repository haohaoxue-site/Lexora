import type {
  AgentGetChatSessionContextResponse,
  AiModelRef,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ChatSessionMessageRole,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import {
  toChatMessageRole,
  toChatSessionDetail,
  toChatSessionModelRef,
  toChatSessionSummary,
} from './chat.utils'

const DEFAULT_CHAT_SESSION_TITLE = '新对话'

const chatSessionSummarySelect = {
  id: true,
  title: true,
  selectedModelServiceConfigId: true,
  selectedModelId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatSessionSelect

const chatSessionDetailSelect = {
  ...chatSessionSummarySelect,
  messages: {
    select: {
      role: true,
      content: true,
      order: true,
    },
    orderBy: {
      order: 'asc',
    },
  },
} satisfies Prisma.ChatSessionSelect

const chatSessionRunDetailSelect = {
  ...chatSessionDetailSelect,
  historyVersion: true,
} satisfies Prisma.ChatSessionSelect

type PersistedChatSessionDetail = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionDetailSelect
}>

type PersistedChatSessionRunDetail = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionRunDetailSelect
}>

const chatSessionModelRefSelect = {
  selectedModelServiceConfigId: true,
  selectedModelId: true,
} satisfies Prisma.ChatSessionSelect

type PersistedChatSessionModelRef = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionModelRefSelect
}>

export interface ChatCompletionSessionContext {
  sessionId: string
  messages: Array<{
    role: ChatSessionMessageRole
    content: string
  }>
  triggerMessageOrder: number
  nextAssistantOrder: number
  expectedHistoryVersion: number
}

@Injectable()
export class ChatSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessions(userId: string): Promise<ChatSessionSummary[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      select: chatSessionSummarySelect,
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return sessions.map(toChatSessionSummary)
  }

  async createSession(userId: string): Promise<ChatSessionDetail> {
    const session = await this.prisma.chatSession.create({
      data: {
        userId,
        title: DEFAULT_CHAT_SESSION_TITLE,
      },
      select: chatSessionDetailSelect,
    })

    return toChatSessionDetail(session)
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSessionDetail> {
    return toChatSessionDetail(await this.findOwnedSessionDetailOrThrow(userId, sessionId))
  }

  async getSessionModelRef(
    userId: string,
    sessionId: string,
  ): Promise<Pick<AiModelRef, 'configId' | 'modelId'> | null> {
    const session = await this.findOwnedSessionModelRefOrThrow(userId, sessionId)
    return toChatSessionModelRef(session)
  }

  async updateSessionModel(input: {
    userId: string
    sessionId: string
    modelRef: Pick<AiModelRef, 'configId' | 'modelId'> | null
  }): Promise<ChatSessionDetail> {
    const result = await this.prisma.chatSession.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
      data: {
        selectedModelServiceConfigId: input.modelRef?.configId ?? null,
        selectedModelId: input.modelRef?.modelId ?? null,
        updatedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new NotFoundException('聊天会话不存在')
    }

    return this.getSession(input.userId, input.sessionId)
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.chatSession.deleteMany({
      where: {
        id: sessionId,
        userId,
      },
    })

    if (result.count === 0) {
      throw new NotFoundException('聊天会话不存在')
    }
  }

  async prepareCompletionSession(input: {
    userId: string
    sessionId: string
    content: string
  }): Promise<ChatCompletionSessionContext> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.userId, input.sessionId)
    const normalizedContent = input.content.trim()
    const triggerMessageOrder = (session.messages.at(-1)?.order ?? -1) + 1
    const nextAssistantOrder = triggerMessageOrder + 1
    const expectedHistoryVersion = session.historyVersion + 1
    const nextTitle = session.messages.length === 0
      ? buildChatSessionTitle(normalizedContent)
      : session.title

    await this.prisma.$transaction([
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: {
          historyVersion: {
            increment: 1,
          },
          title: nextTitle,
          updatedAt: new Date(),
        },
      }),
      this.prisma.chatSessionMessage.create({
        data: {
          sessionId: session.id,
          role: ChatSessionMessageRole.USER,
          content: normalizedContent,
          order: triggerMessageOrder,
        },
      }),
    ])

    return {
      sessionId: session.id,
      messages: session.messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      triggerMessageOrder,
      nextAssistantOrder,
      expectedHistoryVersion,
    }
  }

  async getAgentSessionContext(input: {
    actorId: string
    sessionId: string
    triggerMessageOrder: number
  }): Promise<AgentGetChatSessionContextResponse> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.actorId, input.sessionId)
    const triggerMessage = session.messages.find(message => message.order === input.triggerMessageOrder)

    if (!triggerMessage || triggerMessage.role !== ChatSessionMessageRole.USER) {
      throw new NotFoundException('聊天触发消息不存在')
    }

    return {
      sessionId: session.id,
      historyVersion: session.historyVersion,
      messages: session.messages
        .filter(message => message.order <= input.triggerMessageOrder)
        .map(message => ({
          role: toChatMessageRole(message.role),
          content: message.content,
          order: message.order,
        })),
    }
  }

  async persistAssistantMessage(
    input: {
      sessionId: string
      assistantContent: string
      order: number
      expectedHistoryVersion: number
    },
  ): Promise<void> {
    const normalizedContent = input.assistantContent.trim()
    if (!normalizedContent) {
      return
    }

    const persisted = await this.prisma.$transaction(async (tx) => {
      const sessionUpdate = await tx.chatSession.updateMany({
        where: {
          id: input.sessionId,
          historyVersion: input.expectedHistoryVersion,
        },
        data: {
          historyVersion: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      })

      if (sessionUpdate.count === 0) {
        return false
      }

      await tx.chatSessionMessage.create({
        data: {
          sessionId: input.sessionId,
          role: ChatSessionMessageRole.ASSISTANT,
          content: normalizedContent,
          order: input.order,
        },
      })

      return true
    })

    if (!persisted) {
      throw new ConflictException('聊天历史已变化，请重新发送')
    }
  }

  private async findOwnedSessionDetailOrThrow(
    userId: string,
    sessionId: string,
  ): Promise<PersistedChatSessionDetail> {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: chatSessionDetailSelect,
    })

    if (!session) {
      throw new NotFoundException('聊天会话不存在')
    }

    return session
  }

  private async findOwnedSessionRunDetailOrThrow(
    userId: string,
    sessionId: string,
  ): Promise<PersistedChatSessionRunDetail> {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: chatSessionRunDetailSelect,
    })

    if (!session) {
      throw new NotFoundException('聊天会话不存在')
    }

    return session
  }

  private async findOwnedSessionModelRefOrThrow(
    userId: string,
    sessionId: string,
  ): Promise<PersistedChatSessionModelRef> {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: chatSessionModelRefSelect,
    })

    if (!session) {
      throw new NotFoundException('聊天会话不存在')
    }

    return session
  }
}

function buildChatSessionTitle(content: string) {
  return content.slice(0, 30) + (content.length > 30 ? '...' : '')
}
