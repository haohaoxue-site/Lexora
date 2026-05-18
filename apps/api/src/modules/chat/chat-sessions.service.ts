import type {
  AgentGetChatSessionContextResponse,
  AgentRunModelTarget,
  AiModelRef,
  ChatMessageFailureReason,
  ChatMessageMetadata,
  ChatMutationResponse,
  ChatRunSummary,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_WORKFLOW_KEY,
  CHAT_RUN_STATUS,
  CHAT_SESSION_DEFAULT_TITLE,
  CHAT_SESSION_EVENT_TYPE,
  ChatMutationResponseSchema,
} from '@haohaoxue/samepage-contracts'
import { buildAgentChatThreadId } from '@haohaoxue/samepage-shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ChatSessionMessagePartType,
  ChatSessionMessageRole,
  ChatSessionMessageStatus,
  ChatSessionRunStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { ChatSessionEventsService } from './chat-session-events.service'
import {
  ChatSessionDetailRecord,
  ChatSessionMessageRecord,
  getChatMessageContentSnapshot,
  toChatMessageRole,
  toChatMessageStatus,
  toChatSessionDetail,
  toChatSessionModelRef,
  toChatSessionSummary,
} from './chat.utils'

const continuableAssistantStatuses = new Set<ChatSessionMessageStatus>([
  ChatSessionMessageStatus.COMPLETED,
  ChatSessionMessageStatus.FAILED,
  ChatSessionMessageStatus.CANCELLED,
])

const chatSessionSummarySelect = {
  id: true,
  title: true,
  selectedProviderId: true,
  selectedModelId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatSessionSelect

const chatSessionDetailSelect = {
  ...chatSessionSummarySelect,
  activeRootMessageId: true,
  activeLeafMessageId: true,
  nextEventSequence: true,
  messages: {
    select: {
      id: true,
      role: true,
      status: true,
      content: true,
      parentMessageId: true,
      selectedChildMessageId: true,
      branchOrder: true,
      sourceMessageId: true,
      agentRunId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      parts: {
        select: {
          id: true,
          type: true,
          text: true,
          order: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
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

type PersistedChatSessionMessage = PersistedChatSessionRunDetail['messages'][number]

interface ActivePathState {
  path: PersistedChatSessionMessage[]
  activeRootMessageId: string | null
  activeLeafMessageId: string | null
  selectedChildUpdates: Array<{
    messageId: string
    selectedChildMessageId: string | null
  }>
}

const chatSessionModelRefSelect = {
  selectedProviderId: true,
  selectedModelId: true,
} satisfies Prisma.ChatSessionSelect

type PersistedChatSessionModelRef = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionModelRefSelect
}>

interface CreateRunInput {
  userId: string
  sessionId: string
  content?: string
  sourceMessageId?: string
  targetMessageId?: string
  runId: string
  modelTarget: AgentRunModelTarget
}

interface CreatedRunResult {
  sessionId: string
  runId: string
  assistantMessageId: string
  triggerUserMessageId: string
  expectedHistoryVersion: number
  latestSequence: number
}

@Injectable()
export class ChatSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatSessionEvents: ChatSessionEventsService,
  ) {}

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
        title: CHAT_SESSION_DEFAULT_TITLE,
      },
      select: chatSessionDetailSelect,
    })

    return toChatSessionDetail(toChatSessionDetailRecord(session))
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSessionDetail> {
    const session = await this.findOwnedSessionDetailOrThrow(userId, sessionId)
    await this.repairActivePathSelection(session)

    return toChatSessionDetail(toChatSessionDetailRecord(
      session,
      await this.getActiveRunSummary(session.id),
    ))
  }

  async getSessionModelRef(
    userId: string,
    sessionId: string,
  ): Promise<Pick<AiModelRef, 'providerId' | 'modelId'> | null> {
    const session = await this.findOwnedSessionModelRefOrThrow(userId, sessionId)
    return toChatSessionModelRef(session)
  }

  async updateSessionModel(input: {
    userId: string
    sessionId: string
    modelRef: Pick<AiModelRef, 'providerId' | 'modelId'> | null
  }): Promise<ChatSessionDetail> {
    const result = await this.prisma.chatSession.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
      data: {
        selectedProviderId: input.modelRef?.providerId ?? null,
        selectedModelId: input.modelRef?.modelId ?? null,
        updatedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new NotFoundException('聊天会话不存在')
    }

    return this.getSession(input.userId, input.sessionId)
  }

  async updateSessionTitle(input: {
    userId: string
    sessionId: string
    title: string
  }): Promise<ChatSessionDetail> {
    const title = input.title.trim()

    if (!title) {
      throw new BadRequestException('对话名称不能为空')
    }

    const result = await this.prisma.chatSession.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
      data: {
        title,
        updatedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new NotFoundException('聊天会话不存在')
    }

    return this.getSession(input.userId, input.sessionId)
  }

  async deleteSession(userId: string, sessionId: string): Promise<{ activeRunIds: string[] }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const activeRuns = await tx.chatSessionRun.findMany({
        where: {
          sessionId,
          session: {
            userId,
          },
          status: {
            in: [
              ChatSessionRunStatus.PENDING,
              ChatSessionRunStatus.RUNNING,
            ],
          },
        },
        select: {
          runId: true,
        },
      })
      const deleteResult = await tx.chatSession.deleteMany({
        where: {
          id: sessionId,
          userId,
        },
      })

      return {
        count: deleteResult.count,
        activeRunIds: activeRuns.map(run => run.runId),
      }
    })

    if (result.count === 0) {
      throw new NotFoundException('聊天会话不存在')
    }

    return {
      activeRunIds: result.activeRunIds,
    }
  }

  async batchDeleteSessions(userId: string, sessionIds: string[]): Promise<{
    activeRunIds: string[]
    deletedSessionIds: string[]
  }> {
    const uniqueSessionIds = [...new Set(sessionIds.map(id => id.trim()).filter(Boolean))]

    if (uniqueSessionIds.length === 0) {
      throw new BadRequestException('请选择要删除的聊天会话')
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const ownedSessions = await tx.chatSession.findMany({
        where: {
          id: { in: uniqueSessionIds },
          userId,
        },
        select: {
          id: true,
        },
      })
      const deletedSessionIds = ownedSessions.map(session => session.id)

      if (deletedSessionIds.length === 0) {
        return {
          activeRunIds: [],
          deletedSessionIds,
        }
      }

      const activeRuns = await tx.chatSessionRun.findMany({
        where: {
          sessionId: { in: deletedSessionIds },
          status: {
            in: [
              ChatSessionRunStatus.PENDING,
              ChatSessionRunStatus.RUNNING,
            ],
          },
        },
        select: {
          runId: true,
        },
      })

      await tx.chatSession.deleteMany({
        where: {
          id: { in: deletedSessionIds },
          userId,
        },
      })

      return {
        activeRunIds: activeRuns.map(run => run.runId),
        deletedSessionIds,
      }
    })

    if (result.deletedSessionIds.length === 0) {
      throw new NotFoundException('聊天会话不存在')
    }

    return result
  }

  async sendMessage(input: CreateRunInput & { content: string }): Promise<ChatMutationResponse> {
    const result = await this.createRunFromUserMessage(input)
    return this.toMutationResponse(input.userId, result.sessionId, result.latestSequence, result.runId)
  }

  async editAndSendMessage(input: CreateRunInput & {
    messageId: string
    content: string
  }): Promise<ChatMutationResponse> {
    const result = await this.createRunFromEditedUserMessage(input)
    return this.toMutationResponse(input.userId, result.sessionId, result.latestSequence, result.runId)
  }

  async retryAssistantMessage(input: CreateRunInput & {
    messageId: string
  }): Promise<ChatMutationResponse> {
    const result = await this.createRunFromRetriedAssistantMessage(input)
    return this.toMutationResponse(input.userId, result.sessionId, result.latestSequence, result.runId)
  }

  async switchActiveMessage(input: {
    userId: string
    sessionId: string
    messageId: string
  }): Promise<ChatMutationResponse> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.userId, input.sessionId)
    await this.assertNoActiveRun(input.sessionId)

    const targetMessage = session.messages.find(message => message.id === input.messageId)
    if (!targetMessage) {
      throw new NotFoundException('聊天消息不存在')
    }

    if (targetMessage.parentMessageId) {
      const parentMessage = session.messages.find(message => message.id === targetMessage.parentMessageId)
      if (!parentMessage) {
        throw new ConflictException('聊天消息父节点不存在')
      }

      assertAlternatingChild(parentMessage, targetMessage)
    }
    else if (targetMessage.role !== ChatSessionMessageRole.USER) {
      throw new ConflictException('根分支只能切换到用户消息')
    }

    const path = resolvePathToMessage(session.messages, targetMessage.id)
    const activeRootMessageId = path[0]?.id ?? null
    const nextLeafMessageId = resolveActivePathWithOverride(
      session.messages,
      activeRootMessageId,
      targetMessage,
    ).at(-1)?.id ?? targetMessage.id

    const latestSequence = await this.prisma.$transaction(async (tx) => {
      if (targetMessage.parentMessageId) {
        await tx.chatSessionMessage.update({
          where: { id: targetMessage.parentMessageId },
          data: {
            selectedChildMessageId: targetMessage.id,
          },
        })
      }

      await tx.chatSession.update({
        where: { id: session.id },
        data: {
          activeRootMessageId,
          activeLeafMessageId: nextLeafMessageId,
          historyVersion: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      })

      return this.chatSessionEvents.appendEvents(tx, session.id, [
        {
          type: CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED,
          messageId: targetMessage.id,
          payload: {
            activeRootMessageId,
            activeLeafMessageId: nextLeafMessageId,
          },
        },
      ])
    })

    return this.toMutationResponse(input.userId, input.sessionId, latestSequence)
  }

  async cancelRun(input: {
    userId: string
    runId: string
  }): Promise<ChatMutationResponse> {
    const run = await this.prisma.chatSessionRun.findFirst({
      where: {
        runId: input.runId,
        actorUserId: input.userId,
      },
      select: {
        runId: true,
        sessionId: true,
        assistantMessageId: true,
        status: true,
      },
    })

    if (!run) {
      throw new NotFoundException('聊天运行不存在')
    }

    if (
      run.status !== ChatSessionRunStatus.PENDING
      && run.status !== ChatSessionRunStatus.RUNNING
    ) {
      return this.toMutationResponse(input.userId, run.sessionId, await this.chatSessionEvents.getLatestSequence(run.sessionId), run.runId)
    }

    const completedAt = new Date()
    const latestSequence = await this.prisma.$transaction(async (tx) => {
      await tx.chatSessionRun.update({
        where: { runId: run.runId },
        data: {
          status: ChatSessionRunStatus.CANCELLED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
      await tx.chatSessionMessage.update({
        where: { id: run.assistantMessageId },
        data: {
          status: ChatSessionMessageStatus.CANCELLED,
          completedAt,
        },
      })
      await tx.chatSession.update({
        where: { id: run.sessionId },
        data: {
          updatedAt: completedAt,
        },
      })

      return this.chatSessionEvents.appendEvents(tx, run.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED,
          runId: run.runId,
          payload: {},
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED,
          messageId: run.assistantMessageId,
          runId: run.runId,
          payload: {},
        },
      ])
    })

    return this.toMutationResponse(input.userId, run.sessionId, latestSequence, run.runId)
  }

  async getAgentSessionContext(input: {
    actorId: string
    sessionId: string
    triggerUserMessageId: string
  }): Promise<AgentGetChatSessionContextResponse> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.actorId, input.sessionId)
    const path = resolvePathToMessage(session.messages, input.triggerUserMessageId)
    const triggerMessage = path.at(-1) ?? null

    if (!triggerMessage || triggerMessage.role !== ChatSessionMessageRole.USER) {
      throw new NotFoundException('聊天触发消息不存在')
    }

    const activePath = resolveActivePath(session.messages, session.activeRootMessageId)
    const assistantMessage = activePath.find(message =>
      message.parentMessageId === triggerMessage.id && message.role === ChatSessionMessageRole.ASSISTANT,
    )

    if (!assistantMessage) {
      throw new ConflictException('聊天触发消息缺少助手响应')
    }

    return {
      sessionId: session.id,
      threadId: buildAgentChatThreadId(session.id),
      sessionHistoryVersion: session.historyVersion,
      activePathKey: createChatActivePathKey(activePath),
      triggerUserMessageId: triggerMessage.id,
      triggerParentMessageId: triggerMessage.parentMessageId,
      assistantMessageId: assistantMessage.id,
      messages: activePath
        .filter(message => message.role === ChatSessionMessageRole.USER || message.status === ChatSessionMessageStatus.COMPLETED)
        .map(message => ({
          role: toChatMessageRole(message.role),
          content: getChatMessageContentSnapshot(message),
        })),
    }
  }

  async startAssistantMessageRun(input: {
    runId: string
    messageId: string
  }): Promise<void> {
    const startedAt = new Date()

    await this.prisma.$transaction([
      this.prisma.chatSessionRun.updateMany({
        where: {
          runId: input.runId,
          assistantMessageId: input.messageId,
          status: ChatSessionRunStatus.PENDING,
        },
        data: {
          status: ChatSessionRunStatus.RUNNING,
          startedAt,
        },
      }),
      this.prisma.chatSessionMessage.updateMany({
        where: {
          id: input.messageId,
          status: ChatSessionMessageStatus.PENDING,
        },
        data: {
          status: ChatSessionMessageStatus.STREAMING,
        },
      }),
    ])
  }

  async completeAssistantMessage(input: {
    sessionId: string
    messageId: string
    content: string
    expectedHistoryVersion: number
    metadata?: ChatMessageMetadata
  }): Promise<void> {
    const completedAt = new Date()
    await this.prisma.$transaction(async (tx) => {
      const sessionUpdate = await tx.chatSession.updateMany({
        where: {
          id: input.sessionId,
          historyVersion: input.expectedHistoryVersion,
        },
        data: {
          historyVersion: {
            increment: 1,
          },
          updatedAt: completedAt,
        },
      })

      if (sessionUpdate.count === 0) {
        throw new ConflictException('聊天历史已变化，请重新发送')
      }

      const messageUpdate = await tx.chatSessionMessage.updateMany({
        where: {
          id: input.messageId,
          sessionId: input.sessionId,
          role: ChatSessionMessageRole.ASSISTANT,
        },
        data: {
          status: ChatSessionMessageStatus.COMPLETED,
          content: input.content,
          metadata: input.metadata ? toJsonObject(input.metadata) : undefined,
          completedAt,
        },
      })

      if (messageUpdate.count === 0) {
        throw new ConflictException('聊天助手消息不存在或已结束')
      }

      await tx.chatSessionRun.updateMany({
        where: {
          assistantMessageId: input.messageId,
        },
        data: {
          status: ChatSessionRunStatus.COMPLETED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
    })
  }

  async failAssistantMessage(input: {
    messageId: string
    failureReason: ChatMessageFailureReason
    failureMessage: string
  }): Promise<void> {
    const completedAt = new Date()
    await this.prisma.$transaction([
      this.prisma.chatSessionMessage.update({
        where: {
          id: input.messageId,
        },
        data: {
          status: ChatSessionMessageStatus.FAILED,
          content: '',
          metadata: toJsonObject({
            failureReason: input.failureReason,
            failureMessage: input.failureMessage,
          }),
          completedAt,
        },
      }),
      this.prisma.chatSessionRun.updateMany({
        where: {
          assistantMessageId: input.messageId,
        },
        data: {
          status: ChatSessionRunStatus.FAILED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      }),
    ])
  }

  private async createRunFromUserMessage(input: CreateRunInput & { content: string }): Promise<CreatedRunResult> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.userId, input.sessionId)
    await this.assertNoActiveRun(session.id)

    const normalizedContent = input.content.trim()
    if (!normalizedContent) {
      throw new BadRequestException('消息内容不能为空')
    }

    const activePath = resolveActivePath(session.messages, session.activeRootMessageId)
    const activeLeaf = activePath.at(-1) ?? null

    if (activeLeaf && activeLeaf.role !== ChatSessionMessageRole.ASSISTANT) {
      throw new ConflictException('当前对话历史不是可继续发送状态')
    }

    if (activeLeaf && !continuableAssistantStatuses.has(activeLeaf.status)) {
      throw new ConflictException('当前会话正在生成，请稍后再试')
    }

    const now = new Date()
    const triggerUserMessageId = randomUUID()
    const assistantMessageId = randomUUID()
    const expectedHistoryVersion = session.historyVersion + 1
    const nextTitle = session.messages.length === 0 && session.title === CHAT_SESSION_DEFAULT_TITLE
      ? buildChatSessionTitle(normalizedContent)
      : session.title
    const rootMessageId = activePath[0]?.id ?? triggerUserMessageId
    const userParentMessageId = activeLeaf?.id ?? null
    const userBranchOrder = userParentMessageId
      ? 1
      : getNextBranchOrder(session.messages, null, ChatSessionMessageRole.USER)

    const latestSequence = await this.writeRunMutation(session.id, async (tx) => {
      await this.createUserMessage(tx, {
        id: triggerUserMessageId,
        sessionId: session.id,
        content: normalizedContent,
        parentMessageId: userParentMessageId,
        branchOrder: userBranchOrder,
        sourceMessageId: null,
        completedAt: now,
      })
      await this.createAssistantPendingMessage(tx, {
        id: assistantMessageId,
        sessionId: session.id,
        parentMessageId: triggerUserMessageId,
        branchOrder: 1,
        sourceMessageId: null,
        runId: input.runId,
      })

      if (userParentMessageId) {
        await tx.chatSessionMessage.update({
          where: { id: userParentMessageId },
          data: { selectedChildMessageId: triggerUserMessageId },
        })
      }

      await tx.chatSessionMessage.update({
        where: { id: triggerUserMessageId },
        data: { selectedChildMessageId: assistantMessageId },
      })
      await this.createPendingRun(tx, {
        sessionId: session.id,
        runId: input.runId,
        assistantMessageId,
        triggerUserMessageId,
        actorUserId: input.userId,
        modelTarget: input.modelTarget,
        expectedHistoryVersion,
      })
      await tx.chatSession.update({
        where: { id: session.id },
        data: {
          historyVersion: { increment: 1 },
          title: nextTitle,
          activeRootMessageId: rootMessageId,
          activeLeafMessageId: assistantMessageId,
          updatedAt: now,
        },
      })

      return this.chatSessionEvents.appendEvents(tx, session.id, [
        ...createTitleEvents(session.title, nextTitle),
        createMessageCreatedEvent(triggerUserMessageId, ChatSessionMessageRole.USER, ChatSessionMessageStatus.COMPLETED),
        createMessageCreatedEvent(assistantMessageId, ChatSessionMessageRole.ASSISTANT, ChatSessionMessageStatus.PENDING, input.runId),
        createBranchSwitchedEvent(rootMessageId, assistantMessageId),
      ])
    })

    return {
      sessionId: session.id,
      runId: input.runId,
      assistantMessageId,
      triggerUserMessageId,
      expectedHistoryVersion,
      latestSequence,
    }
  }

  private async createRunFromEditedUserMessage(input: CreateRunInput & {
    messageId: string
    content: string
  }): Promise<CreatedRunResult> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.userId, input.sessionId)
    await this.assertNoActiveRun(session.id)

    const sourceMessage = session.messages.find(message => message.id === input.messageId)
    if (!sourceMessage || sourceMessage.role !== ChatSessionMessageRole.USER) {
      throw new NotFoundException('可编辑的用户消息不存在')
    }

    const normalizedContent = input.content.trim()
    if (!normalizedContent) {
      throw new BadRequestException('消息内容不能为空')
    }

    const now = new Date()
    const triggerUserMessageId = randomUUID()
    const assistantMessageId = randomUUID()
    const expectedHistoryVersion = session.historyVersion + 1
    const rootMessageId = sourceMessage.parentMessageId
      ? resolvePathToMessage(session.messages, sourceMessage.parentMessageId)[0]?.id ?? triggerUserMessageId
      : triggerUserMessageId
    const userBranchOrder = getNextBranchOrder(
      session.messages,
      sourceMessage.parentMessageId,
      ChatSessionMessageRole.USER,
    )

    const latestSequence = await this.writeRunMutation(session.id, async (tx) => {
      await this.createUserMessage(tx, {
        id: triggerUserMessageId,
        sessionId: session.id,
        content: normalizedContent,
        parentMessageId: sourceMessage.parentMessageId,
        branchOrder: userBranchOrder,
        sourceMessageId: sourceMessage.id,
        completedAt: now,
      })
      await this.createAssistantPendingMessage(tx, {
        id: assistantMessageId,
        sessionId: session.id,
        parentMessageId: triggerUserMessageId,
        branchOrder: 1,
        sourceMessageId: null,
        runId: input.runId,
      })

      if (sourceMessage.parentMessageId) {
        await tx.chatSessionMessage.update({
          where: { id: sourceMessage.parentMessageId },
          data: { selectedChildMessageId: triggerUserMessageId },
        })
      }

      await tx.chatSessionMessage.update({
        where: { id: triggerUserMessageId },
        data: { selectedChildMessageId: assistantMessageId },
      })
      await this.createPendingRun(tx, {
        sessionId: session.id,
        runId: input.runId,
        assistantMessageId,
        triggerUserMessageId,
        actorUserId: input.userId,
        modelTarget: input.modelTarget,
        expectedHistoryVersion,
      })
      await tx.chatSession.update({
        where: { id: session.id },
        data: {
          historyVersion: { increment: 1 },
          activeRootMessageId: rootMessageId,
          activeLeafMessageId: assistantMessageId,
          updatedAt: now,
        },
      })

      return this.chatSessionEvents.appendEvents(tx, session.id, [
        createMessageCreatedEvent(triggerUserMessageId, ChatSessionMessageRole.USER, ChatSessionMessageStatus.COMPLETED),
        createMessageCreatedEvent(assistantMessageId, ChatSessionMessageRole.ASSISTANT, ChatSessionMessageStatus.PENDING, input.runId),
        createBranchSwitchedEvent(rootMessageId, assistantMessageId),
      ])
    })

    return {
      sessionId: session.id,
      runId: input.runId,
      assistantMessageId,
      triggerUserMessageId,
      expectedHistoryVersion,
      latestSequence,
    }
  }

  private async createRunFromRetriedAssistantMessage(input: CreateRunInput & {
    messageId: string
  }): Promise<CreatedRunResult> {
    const session = await this.findOwnedSessionRunDetailOrThrow(input.userId, input.sessionId)
    await this.assertNoActiveRun(session.id)

    const sourceMessage = session.messages.find(message => message.id === input.messageId)
    if (!sourceMessage || sourceMessage.role !== ChatSessionMessageRole.ASSISTANT) {
      throw new NotFoundException('可重试的助手消息不存在')
    }
    if (!sourceMessage.parentMessageId) {
      throw new ConflictException('助手消息缺少用户父消息')
    }

    const triggerMessage = session.messages.find(message => message.id === sourceMessage.parentMessageId)
    if (!triggerMessage || triggerMessage.role !== ChatSessionMessageRole.USER) {
      throw new ConflictException('助手消息父节点不是用户消息')
    }

    const assistantMessageId = randomUUID()
    const expectedHistoryVersion = session.historyVersion + 1
    const rootMessageId = resolvePathToMessage(session.messages, triggerMessage.id)[0]?.id ?? triggerMessage.id
    const assistantBranchOrder = getNextBranchOrder(
      session.messages,
      triggerMessage.id,
      ChatSessionMessageRole.ASSISTANT,
    )

    const latestSequence = await this.writeRunMutation(session.id, async (tx) => {
      await this.createAssistantPendingMessage(tx, {
        id: assistantMessageId,
        sessionId: session.id,
        parentMessageId: triggerMessage.id,
        branchOrder: assistantBranchOrder,
        sourceMessageId: sourceMessage.id,
        runId: input.runId,
      })
      await tx.chatSessionMessage.update({
        where: { id: triggerMessage.id },
        data: { selectedChildMessageId: assistantMessageId },
      })
      await this.createPendingRun(tx, {
        sessionId: session.id,
        runId: input.runId,
        assistantMessageId,
        triggerUserMessageId: triggerMessage.id,
        actorUserId: input.userId,
        modelTarget: input.modelTarget,
        expectedHistoryVersion,
      })
      await tx.chatSession.update({
        where: { id: session.id },
        data: {
          historyVersion: { increment: 1 },
          activeRootMessageId: rootMessageId,
          activeLeafMessageId: assistantMessageId,
          updatedAt: new Date(),
        },
      })

      return this.chatSessionEvents.appendEvents(tx, session.id, [
        createMessageCreatedEvent(assistantMessageId, ChatSessionMessageRole.ASSISTANT, ChatSessionMessageStatus.PENDING, input.runId),
        createBranchSwitchedEvent(rootMessageId, assistantMessageId),
      ])
    })

    return {
      sessionId: session.id,
      runId: input.runId,
      assistantMessageId,
      triggerUserMessageId: triggerMessage.id,
      expectedHistoryVersion,
      latestSequence,
    }
  }

  private async writeRunMutation(
    sessionId: string,
    write: (tx: Prisma.TransactionClient) => Promise<number>,
  ): Promise<number> {
    try {
      return await this.prisma.$transaction(write)
    }
    catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('当前会话正在生成，请稍后再试')
      }

      throw error
    }
  }

  private async assertNoActiveRun(sessionId: string): Promise<void> {
    const activeRun = await this.prisma.chatSessionRun.findFirst({
      where: {
        sessionId,
        status: {
          in: [ChatSessionRunStatus.PENDING, ChatSessionRunStatus.RUNNING],
        },
      },
      select: {
        id: true,
      },
    })

    if (activeRun) {
      throw new ConflictException('当前会话正在生成，请稍后再试')
    }
  }

  private async createUserMessage(
    tx: Prisma.TransactionClient,
    input: {
      id: string
      sessionId: string
      content: string
      parentMessageId: string | null
      branchOrder: number
      sourceMessageId: string | null
      completedAt: Date
    },
  ): Promise<void> {
    await tx.chatSessionMessage.create({
      data: {
        id: input.id,
        sessionId: input.sessionId,
        role: ChatSessionMessageRole.USER,
        status: ChatSessionMessageStatus.COMPLETED,
        content: input.content,
        parentMessageId: input.parentMessageId,
        branchOrder: input.branchOrder,
        sourceMessageId: input.sourceMessageId,
        completedAt: input.completedAt,
        parts: {
          create: {
            type: ChatSessionMessagePartType.TEXT,
            text: input.content,
            order: 0,
          },
        },
      },
    })
  }

  private async createAssistantPendingMessage(
    tx: Prisma.TransactionClient,
    input: {
      id: string
      sessionId: string
      parentMessageId: string
      branchOrder: number
      sourceMessageId: string | null
      runId: string
    },
  ): Promise<void> {
    await tx.chatSessionMessage.create({
      data: {
        id: input.id,
        sessionId: input.sessionId,
        role: ChatSessionMessageRole.ASSISTANT,
        status: ChatSessionMessageStatus.PENDING,
        content: '',
        parentMessageId: input.parentMessageId,
        branchOrder: input.branchOrder,
        sourceMessageId: input.sourceMessageId,
        agentRunId: input.runId,
      },
    })
  }

  private async createPendingRun(
    tx: Prisma.TransactionClient,
    input: {
      sessionId: string
      runId: string
      assistantMessageId: string
      triggerUserMessageId: string
      actorUserId: string
      modelTarget: AgentRunModelTarget
      expectedHistoryVersion: number
    },
  ): Promise<void> {
    await tx.chatSessionRun.create({
      data: {
        runId: input.runId,
        sessionId: input.sessionId,
        assistantMessageId: input.assistantMessageId,
        triggerUserMessageId: input.triggerUserMessageId,
        actorUserId: input.actorUserId,
        workflowKey: AGENT_WORKFLOW_KEY.CHAT_REPLY,
        modelTargetSnapshot: toJsonObject(input.modelTarget),
        commandContext: toJsonObject({
          expectedHistoryVersion: input.expectedHistoryVersion,
        }),
        status: ChatSessionRunStatus.PENDING,
      },
    })
  }

  private async toMutationResponse(
    userId: string,
    sessionId: string,
    latestSequence: number,
    runId?: string,
  ): Promise<ChatMutationResponse> {
    const [session, run] = await Promise.all([
      this.getSession(userId, sessionId),
      runId ? this.getRunSummary(runId) : Promise.resolve(undefined),
    ])

    return ChatMutationResponseSchema.parse({
      session,
      latestSequence,
      run,
    })
  }

  private async getRunSummary(runId: string): Promise<ChatRunSummary> {
    const run = await this.prisma.chatSessionRun.findUnique({
      where: { runId },
      select: {
        runId: true,
        status: true,
        assistantMessageId: true,
        triggerUserMessageId: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    })

    if (!run) {
      throw new NotFoundException('聊天运行不存在')
    }

    return toChatRunSummary(run)
  }

  private async getActiveRunSummary(sessionId: string): Promise<ChatRunSummary | null> {
    const run = await this.prisma.chatSessionRun.findFirst({
      where: {
        sessionId,
        status: {
          in: [ChatSessionRunStatus.PENDING, ChatSessionRunStatus.RUNNING],
        },
      },
      select: {
        runId: true,
        status: true,
        assistantMessageId: true,
        triggerUserMessageId: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return run ? toChatRunSummary(run) : null
  }

  private async repairActivePathSelection(session: PersistedChatSessionDetail): Promise<void> {
    const state = resolveActivePathState(session.messages, session.activeRootMessageId)
    const shouldRepairSession
      = session.activeRootMessageId !== state.activeRootMessageId
        || session.activeLeafMessageId !== state.activeLeafMessageId

    if (!shouldRepairSession && state.selectedChildUpdates.length === 0) {
      return
    }

    await this.prisma.$transaction(async (tx) => {
      if (shouldRepairSession) {
        await tx.chatSession.update({
          where: { id: session.id },
          data: {
            activeRootMessageId: state.activeRootMessageId,
            activeLeafMessageId: state.activeLeafMessageId,
          },
        })
      }

      for (const update of state.selectedChildUpdates) {
        await tx.chatSessionMessage.update({
          where: { id: update.messageId },
          data: {
            selectedChildMessageId: update.selectedChildMessageId,
          },
        })
      }
    })
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

function toChatSessionDetailRecord(
  session: PersistedChatSessionDetail,
  activeRun: ChatRunSummary | null = null,
): ChatSessionDetailRecord {
  const activePath = resolveActivePathState(session.messages, session.activeRootMessageId).path

  return {
    id: session.id,
    title: session.title,
    selectedProviderId: session.selectedProviderId,
    selectedModelId: session.selectedModelId,
    latestSequence: Math.max(0, session.nextEventSequence - 1),
    activeRun,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: activePath.map(message => toChatSessionMessageRecord(message, session.messages)),
  }
}

function toChatSessionMessageRecord(
  message: PersistedChatSessionMessage,
  messages: PersistedChatSessionMessage[],
): ChatSessionMessageRecord {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    content: message.content,
    branch: getMessageBranch(message, messages),
    parts: message.parts,
    metadata: message.metadata,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    completedAt: message.completedAt,
  }
}

function resolveActivePath(
  messages: PersistedChatSessionMessage[],
  activeRootMessageId: string | null,
): PersistedChatSessionMessage[] {
  return resolveActivePathState(messages, activeRootMessageId).path
}

function resolveActivePathState(
  messages: PersistedChatSessionMessage[],
  activeRootMessageId: string | null,
): ActivePathState {
  const rootMessages = sortBranchMessages(messages.filter(message =>
    message.parentMessageId === null && message.role === ChatSessionMessageRole.USER,
  ))
  const rootMessage = activeRootMessageId
    ? rootMessages.find(message => message.id === activeRootMessageId) ?? rootMessages.at(-1) ?? null
    : rootMessages.at(-1) ?? null

  if (!rootMessage) {
    return {
      path: [],
      activeRootMessageId: null,
      activeLeafMessageId: null,
      selectedChildUpdates: [],
    }
  }

  const path: PersistedChatSessionMessage[] = []
  const selectedChildUpdates: ActivePathState['selectedChildUpdates'] = []
  const visited = new Set<string>()
  let currentMessage: PersistedChatSessionMessage | null = rootMessage

  while (currentMessage && !visited.has(currentMessage.id)) {
    path.push(currentMessage)
    visited.add(currentMessage.id)

    const nextRole = currentMessage.role === ChatSessionMessageRole.USER
      ? ChatSessionMessageRole.ASSISTANT
      : ChatSessionMessageRole.USER
    const children = sortBranchMessages(messages.filter(message =>
      message.parentMessageId === currentMessage?.id && message.role === nextRole,
    ))

    if (children.length === 0) {
      if (currentMessage.selectedChildMessageId !== null) {
        selectedChildUpdates.push({
          messageId: currentMessage.id,
          selectedChildMessageId: null,
        })
      }
      break
    }

    const selectedChild = currentMessage.selectedChildMessageId
      ? children.find(message => message.id === currentMessage?.selectedChildMessageId) ?? null
      : null

    const nextMessage = selectedChild ?? children.at(-1) ?? null
    if (nextMessage && currentMessage.selectedChildMessageId !== nextMessage.id) {
      selectedChildUpdates.push({
        messageId: currentMessage.id,
        selectedChildMessageId: nextMessage.id,
      })
    }
    currentMessage = nextMessage
  }

  return {
    path,
    activeRootMessageId: rootMessage.id,
    activeLeafMessageId: path.at(-1)?.id ?? rootMessage.id,
    selectedChildUpdates,
  }
}

function resolvePathToMessage(
  messages: PersistedChatSessionMessage[],
  messageId: string,
): PersistedChatSessionMessage[] {
  const messageById = new Map(messages.map(message => [message.id, message]))
  const path: PersistedChatSessionMessage[] = []
  const visited = new Set<string>()
  let currentMessage = messageById.get(messageId) ?? null

  while (currentMessage && !visited.has(currentMessage.id)) {
    path.push(currentMessage)
    visited.add(currentMessage.id)
    currentMessage = currentMessage.parentMessageId
      ? messageById.get(currentMessage.parentMessageId) ?? null
      : null
  }

  return path.reverse()
}

function createChatActivePathKey(messages: PersistedChatSessionMessage[]): string {
  return messages.map(message => message.id).join('>')
}

function resolveActivePathWithOverride(
  messages: PersistedChatSessionMessage[],
  activeRootMessageId: string | null,
  targetMessage: PersistedChatSessionMessage,
): PersistedChatSessionMessage[] {
  const nextMessages = messages.map((message) => {
    if (targetMessage.parentMessageId && message.id === targetMessage.parentMessageId) {
      return {
        ...message,
        selectedChildMessageId: targetMessage.id,
      }
    }

    return message
  })

  return resolveActivePath(nextMessages, targetMessage.parentMessageId ? activeRootMessageId : targetMessage.id)
}

function getMessageBranch(
  message: PersistedChatSessionMessage,
  messages: PersistedChatSessionMessage[],
): ChatSessionMessageRecord['branch'] {
  const siblings = sortBranchMessages(messages.filter(item =>
    item.parentMessageId === message.parentMessageId && item.role === message.role,
  ))
  const index = siblings.findIndex(item => item.id === message.id)

  return {
    index: index >= 0 ? index + 1 : 1,
    count: siblings.length || 1,
    previousMessageId: index > 0 ? siblings[index - 1]?.id ?? null : null,
    nextMessageId: index >= 0 && index < siblings.length - 1 ? siblings[index + 1]?.id ?? null : null,
  }
}

function getNextBranchOrder(
  messages: PersistedChatSessionMessage[],
  parentMessageId: string | null,
  role: ChatSessionMessageRole,
): number {
  return messages
    .filter(message => message.parentMessageId === parentMessageId && message.role === role)
    .reduce((maxOrder, message) => Math.max(maxOrder, message.branchOrder), 0) + 1
}

function sortBranchMessages<T extends Pick<PersistedChatSessionMessage, 'branchOrder' | 'createdAt' | 'id'>>(messages: T[]): T[] {
  return [...messages].sort((left, right) =>
    left.branchOrder - right.branchOrder
    || left.createdAt.getTime() - right.createdAt.getTime()
    || left.id.localeCompare(right.id),
  )
}

function buildChatSessionTitle(content: string) {
  return content.slice(0, 30) + (content.length > 30 ? '...' : '')
}

function createTitleEvents(previousTitle: string, nextTitle: string) {
  if (previousTitle === nextTitle) {
    return []
  }

  return [
    {
      type: CHAT_SESSION_EVENT_TYPE.TITLE_UPDATED,
      payload: {
        title: nextTitle,
      },
    },
  ]
}

function createMessageCreatedEvent(
  messageId: string,
  role: ChatSessionMessageRole,
  status: ChatSessionMessageStatus,
  runId?: string,
) {
  return {
    type: CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED,
    messageId,
    runId: runId ?? null,
    payload: {
      role: toChatMessageRole(role),
      status: toChatMessageStatus(status),
    },
  }
}

function createBranchSwitchedEvent(activeRootMessageId: string | null, activeLeafMessageId: string | null) {
  return {
    type: CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED,
    payload: {
      activeRootMessageId,
      activeLeafMessageId,
    },
  }
}

function assertAlternatingChild(
  parentMessage: PersistedChatSessionMessage,
  childMessage: PersistedChatSessionMessage,
): void {
  const expectedRole = parentMessage.role === ChatSessionMessageRole.USER
    ? ChatSessionMessageRole.ASSISTANT
    : ChatSessionMessageRole.USER

  if (childMessage.role !== expectedRole) {
    throw new ConflictException('聊天分支角色不符合交替规则')
  }
}

function toChatRunStatus(status: ChatSessionRunStatus): ChatRunSummary['status'] {
  if (status === ChatSessionRunStatus.PENDING) {
    return CHAT_RUN_STATUS.PENDING
  }
  if (status === ChatSessionRunStatus.RUNNING) {
    return CHAT_RUN_STATUS.RUNNING
  }
  if (status === ChatSessionRunStatus.FAILED) {
    return CHAT_RUN_STATUS.FAILED
  }
  if (status === ChatSessionRunStatus.CANCELLED) {
    return CHAT_RUN_STATUS.CANCELLED
  }

  return CHAT_RUN_STATUS.COMPLETED
}

function toChatRunSummary(run: {
  runId: string
  status: ChatSessionRunStatus
  assistantMessageId: string
  triggerUserMessageId: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}): ChatRunSummary {
  return {
    runId: run.runId,
    status: toChatRunStatus(run.status),
    assistantMessageId: run.assistantMessageId,
    triggerUserMessageId: run.triggerUserMessageId,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function toJsonObject(value: object): Prisma.InputJsonObject
function toJsonObject(value: undefined): undefined
function toJsonObject(value: object | undefined): Prisma.InputJsonObject | undefined {
  if (!value) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject
}
