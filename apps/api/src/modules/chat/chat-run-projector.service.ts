import type {
  AgentRunEvent,
  ChatMessageFailureReason,
  ChatMessageMetadata,
  ChatMessagePartMetadata,
} from '@haohaoxue/samepage-contracts'
import {
  AGENT_RUN_EVENT_TYPE,
  AgentWorkflowKeySchema,
  CHAT_MESSAGE_FAILURE_REASON,
  CHAT_MESSAGE_PART_TYPE,
  CHAT_SESSION_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import {
  ChatSessionMessagePartType,
  ChatSessionMessageStatus,
  ChatSessionRunStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import {
  AgentRunEventsConsumerError,
  AgentRunEventsService,
  getAgentRunEventText,
} from '../agent/agent-events.service'
import { ChatSessionEventsService } from './chat-session-events.service'
import { toPrismaChatMessagePartType } from './chat.utils'

const PROJECT_RUNNING_INTERVAL_MS = 2000
const PROJECT_RUNNING_BATCH_SIZE = 5
const EMPTY_AGENT_EVENT_STREAM_ID = '0-0'

@Injectable()
export class ChatRunProjectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRunProjectorService.name)
  private readonly projectingRunIds = new Set<string>()
  private recoverTimer: ReturnType<typeof setInterval> | null = null
  private recovering = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRunEventsService: AgentRunEventsService,
    private readonly chatSessionEvents: ChatSessionEventsService,
  ) {}

  onModuleInit(): void {
    this.recoverTimer = setInterval(() => {
      void this.recoverRunningRuns().catch(error => this.logger.error(
        error instanceof Error ? error.message : 'recover running chat runs failed',
        error instanceof Error ? error.stack : undefined,
      ))
    }, PROJECT_RUNNING_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (!this.recoverTimer) {
      return
    }

    clearInterval(this.recoverTimer)
    this.recoverTimer = null
  }

  async recoverRunningRuns(): Promise<void> {
    if (this.recovering) {
      return
    }

    this.recovering = true
    try {
      const runs = await this.prisma.chatSessionRun.findMany({
        where: {
          commandPublishedAt: {
            not: null,
          },
          status: ChatSessionRunStatus.RUNNING,
        },
        select: {
          runId: true,
        },
        orderBy: {
          updatedAt: 'asc',
        },
        take: PROJECT_RUNNING_BATCH_SIZE,
      })

      await Promise.all(runs.map(run => this.recoverRun(run.runId)))
    }
    finally {
      this.recovering = false
    }
  }

  async projectRun(input: {
    runId: string
    afterId: string
  }): Promise<void> {
    if (this.projectingRunIds.has(input.runId)) {
      return
    }

    this.projectingRunIds.add(input.runId)
    try {
      const run = await this.prisma.chatSessionRun.findUnique({
        where: { runId: input.runId },
        select: {
          runId: true,
          sessionId: true,
          assistantMessageId: true,
          workflowKey: true,
          commandContext: true,
          status: true,
        },
      })

      if (!run || run.status !== ChatSessionRunStatus.RUNNING) {
        return
      }

      let reasoningText = await this.getMessagePartText(run.assistantMessageId, ChatSessionMessagePartType.REASONING)
      let answerText = await this.getMessagePartText(run.assistantMessageId, ChatSessionMessagePartType.TEXT)

      try {
        await this.agentRunEventsService.consumeRunEvents({
          runId: run.runId,
          workflowKey: AgentWorkflowKeySchema.parse(run.workflowKey),
          afterId: input.afterId,
          messages: {
            aborted: '聊天请求已取消',
            cancelled: '聊天运行已取消',
            timedOut: '等待聊天运行结果超时',
            failed: '聊天运行失败',
          },
          onEvent: async (event, sourceEventId) => {
            if (event.type === AGENT_RUN_EVENT_TYPE.REASONING_DELTA) {
              const text = getAgentRunEventText(event)
              if (!text || await this.chatSessionEvents.hasSourceEvent(run.runId, sourceEventId)) {
                return
              }

              reasoningText += text
              await this.appendPartDelta({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
                type: CHAT_MESSAGE_PART_TYPE.REASONING,
                text,
                snapshotText: reasoningText,
              })
              return
            }

            if (event.type === AGENT_RUN_EVENT_TYPE.TEXT_DELTA) {
              const text = getAgentRunEventText(event)
              if (!text || await this.chatSessionEvents.hasSourceEvent(run.runId, sourceEventId)) {
                return
              }

              answerText += text
              await this.appendPartDelta({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
                type: CHAT_MESSAGE_PART_TYPE.TEXT,
                text,
                snapshotText: answerText,
              })
              return
            }

            if (event.type === AGENT_RUN_EVENT_TYPE.TOOL_RESULT) {
              const payload = readToolResultPayload(event)
              if (!payload || await this.chatSessionEvents.hasSourceEvent(run.runId, sourceEventId)) {
                return
              }

              await this.appendToolResultDelta({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
                text: payload.content,
                metadata: {
                  toolCallId: payload.toolCallId,
                  toolName: payload.toolName,
                },
              })
              return
            }

            if (event.type === AGENT_RUN_EVENT_TYPE.RUN_COMPLETED) {
              await this.completeRun({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
                content: answerText,
                metadata: buildCompletedMessageMetadata({
                  event,
                  startedAt: Date.now(),
                  reasoningStartedAt: null,
                  reasoningEndedAt: null,
                }),
                expectedHistoryVersion: getExpectedHistoryVersion(run.commandContext),
              })
              return
            }

            if (event.type === AGENT_RUN_EVENT_TYPE.RUN_FAILED || event.type === AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT) {
              await this.failRun({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
                failureReason: event.type === AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT
                  ? CHAT_MESSAGE_FAILURE_REASON.TIMED_OUT
                  : CHAT_MESSAGE_FAILURE_REASON.FAILED,
                failureMessage: getFailureMessageFromEvent(event, '聊天运行失败'),
              })
              return
            }

            if (event.type === AGENT_RUN_EVENT_TYPE.RUN_CANCELLED) {
              await this.cancelRun({
                runId: run.runId,
                sessionId: run.sessionId,
                messageId: run.assistantMessageId,
                sourceEventId,
              })
            }
          },
        })
      }
      catch (error) {
        if (await this.isTerminalRun(run.runId)) {
          return
        }

        const failureReason = getFailureReason(error)
        if (failureReason === CHAT_MESSAGE_FAILURE_REASON.CANCELLED) {
          await this.cancelRun({
            runId: run.runId,
            sessionId: run.sessionId,
            messageId: run.assistantMessageId,
            sourceEventId: null,
          })
          return
        }

        await this.failRun({
          runId: run.runId,
          sessionId: run.sessionId,
          messageId: run.assistantMessageId,
          sourceEventId: null,
          failureReason,
          failureMessage: getFailureMessage(error),
        })
      }
    }
    finally {
      this.projectingRunIds.delete(input.runId)
    }
  }

  private async recoverRun(runId: string): Promise<void> {
    const afterId = await this.chatSessionEvents.getLatestSourceEventStreamId(runId) ?? EMPTY_AGENT_EVENT_STREAM_ID
    await this.projectRun({
      runId,
      afterId,
    })
  }

  private async getMessagePartText(messageId: string, type: ChatSessionMessagePartType): Promise<string> {
    const part = await this.prisma.chatSessionMessagePart.findFirst({
      where: {
        messageId,
        type,
      },
      select: {
        text: true,
      },
      orderBy: {
        order: 'asc',
      },
    })

    return part?.text ?? ''
  }

  private async appendPartDelta(input: {
    runId: string
    sessionId: string
    messageId: string
    sourceEventId: string
    type: typeof CHAT_MESSAGE_PART_TYPE.REASONING | typeof CHAT_MESSAGE_PART_TYPE.TEXT
    text: string
    snapshotText: string
  }): Promise<void> {
    await ignoreUniqueConstraint(async () => this.prisma.$transaction(async (tx) => {
      if (!await isRunStatus(tx, input.runId, ChatSessionRunStatus.RUNNING)) {
        return
      }

      const order = getSinglePartOrder(input.type)
      const part = await tx.chatSessionMessagePart.upsert({
        where: {
          messageId_order: {
            messageId: input.messageId,
            order,
          },
        },
        create: {
          messageId: input.messageId,
          type: toPrismaChatMessagePartType(input.type),
          text: input.snapshotText,
          order,
        },
        update: {
          type: toPrismaChatMessagePartType(input.type),
          text: input.snapshotText,
        },
        select: {
          id: true,
          order: true,
        },
      })
      await tx.chatSessionMessage.update({
        where: { id: input.messageId },
        data: {
          content: input.type === CHAT_MESSAGE_PART_TYPE.TEXT ? input.snapshotText : undefined,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA,
          messageId: input.messageId,
          runId: input.runId,
          sourceEventId: input.sourceEventId,
          payload: {
            partId: part.id,
            partType: input.type,
            order: part.order,
            delta: input.text,
            metadata: null,
          },
        },
      ])
    }))
  }

  private async appendToolResultDelta(input: {
    runId: string
    sessionId: string
    messageId: string
    sourceEventId: string
    text: string
    metadata: ChatMessagePartMetadata
  }): Promise<void> {
    await ignoreUniqueConstraint(async () => this.prisma.$transaction(async (tx) => {
      if (!await isRunStatus(tx, input.runId, ChatSessionRunStatus.RUNNING)) {
        return
      }

      const latestPart = await tx.chatSessionMessagePart.findFirst({
        where: {
          messageId: input.messageId,
        },
        select: {
          order: true,
        },
        orderBy: {
          order: 'desc',
        },
      })
      const order = Math.max(2, (latestPart?.order ?? 1) + 1)
      const part = await tx.chatSessionMessagePart.upsert({
        where: {
          messageId_order: {
            messageId: input.messageId,
            order,
          },
        },
        create: {
          messageId: input.messageId,
          type: toPrismaChatMessagePartType(CHAT_MESSAGE_PART_TYPE.TOOL_RESULT),
          text: input.text,
          order,
          metadata: toJsonObject(input.metadata),
        },
        update: {
          type: toPrismaChatMessagePartType(CHAT_MESSAGE_PART_TYPE.TOOL_RESULT),
          text: input.text,
          metadata: toJsonObject(input.metadata),
        },
        select: {
          id: true,
          order: true,
        },
      })

      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA,
          messageId: input.messageId,
          runId: input.runId,
          sourceEventId: input.sourceEventId,
          payload: {
            partId: part.id,
            partType: CHAT_MESSAGE_PART_TYPE.TOOL_RESULT,
            order: part.order,
            delta: input.text,
            metadata: input.metadata,
          },
        },
      ])
    }))
  }

  private async completeRun(input: {
    runId: string
    sessionId: string
    messageId: string
    sourceEventId: string
    content: string
    metadata: ChatMessageMetadata
    expectedHistoryVersion: number
  }): Promise<void> {
    if (await this.chatSessionEvents.hasSourceEvent(input.runId, `${input.sourceEventId}:message`)) {
      return
    }

    const completedAt = new Date()
    await ignoreUniqueConstraint(async () => this.prisma.$transaction(async (tx) => {
      if (!await isRunStatus(tx, input.runId, ChatSessionRunStatus.RUNNING)) {
        return
      }

      const sessionUpdate = await tx.chatSession.updateMany({
        where: {
          id: input.sessionId,
          historyVersion: input.expectedHistoryVersion,
        },
        data: {
          historyVersion: { increment: 1 },
          updatedAt: completedAt,
        },
      })

      if (sessionUpdate.count === 0) {
        throw new Error('聊天历史已变化，请重新发送')
      }

      await tx.chatSessionMessage.update({
        where: { id: input.messageId },
        data: {
          status: ChatSessionMessageStatus.COMPLETED,
          content: input.content,
          metadata: toJsonObject(input.metadata),
          completedAt,
        },
      })
      await tx.chatSessionRun.update({
        where: { runId: input.runId },
        data: {
          status: ChatSessionRunStatus.COMPLETED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED,
          messageId: input.messageId,
          runId: input.runId,
          sourceEventId: `${input.sourceEventId}:message`,
          payload: {
            content: input.content,
          },
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED,
          runId: input.runId,
          sourceEventId: `${input.sourceEventId}:run`,
          payload: {},
        },
      ])
    }))
  }

  private async failRun(input: {
    runId: string
    sessionId: string
    messageId: string
    sourceEventId: string | null
    failureReason: ChatMessageFailureReason
    failureMessage: string
  }): Promise<void> {
    const sourceEventId = input.sourceEventId ? `${input.sourceEventId}:message` : null
    if (sourceEventId && await this.chatSessionEvents.hasSourceEvent(input.runId, sourceEventId)) {
      return
    }

    const completedAt = new Date()
    await ignoreUniqueConstraint(async () => this.prisma.$transaction(async (tx) => {
      if (!await isRunStatus(tx, input.runId, ChatSessionRunStatus.RUNNING)) {
        return
      }

      await tx.chatSessionMessage.update({
        where: { id: input.messageId },
        data: {
          status: ChatSessionMessageStatus.FAILED,
          metadata: toJsonObject({
            failureReason: input.failureReason,
            failureMessage: input.failureMessage,
          }),
          completedAt,
        },
      })
      await tx.chatSessionRun.update({
        where: { runId: input.runId },
        data: {
          status: ChatSessionRunStatus.FAILED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
      await tx.chatSession.update({
        where: { id: input.sessionId },
        data: {
          updatedAt: completedAt,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED,
          messageId: input.messageId,
          runId: input.runId,
          sourceEventId,
          payload: {
            failureReason: input.failureReason,
            failureMessage: input.failureMessage,
          },
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_FAILED,
          runId: input.runId,
          sourceEventId: input.sourceEventId ? `${input.sourceEventId}:run` : null,
          payload: {
            failureReason: input.failureReason,
            failureMessage: input.failureMessage,
          },
        },
      ])
    }))
  }

  private async cancelRun(input: {
    runId: string
    sessionId: string
    messageId: string
    sourceEventId: string | null
  }): Promise<void> {
    const sourceEventId = input.sourceEventId ? `${input.sourceEventId}:message` : null
    if (sourceEventId && await this.chatSessionEvents.hasSourceEvent(input.runId, sourceEventId)) {
      return
    }

    const completedAt = new Date()
    await ignoreUniqueConstraint(async () => this.prisma.$transaction(async (tx) => {
      if (!await isRunStatus(tx, input.runId, ChatSessionRunStatus.RUNNING)) {
        return
      }

      await tx.chatSessionMessage.update({
        where: { id: input.messageId },
        data: {
          status: ChatSessionMessageStatus.CANCELLED,
          completedAt,
        },
      })
      await tx.chatSessionRun.update({
        where: { runId: input.runId },
        data: {
          status: ChatSessionRunStatus.CANCELLED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
      await tx.chatSession.update({
        where: { id: input.sessionId },
        data: {
          updatedAt: completedAt,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED,
          messageId: input.messageId,
          runId: input.runId,
          sourceEventId,
          payload: {},
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED,
          runId: input.runId,
          sourceEventId: input.sourceEventId ? `${input.sourceEventId}:run` : null,
          payload: {},
        },
      ])
    }))
  }

  private async isTerminalRun(runId: string): Promise<boolean> {
    const run = await this.prisma.chatSessionRun.findUnique({
      where: { runId },
      select: { status: true },
    })

    return !run
      || run.status === ChatSessionRunStatus.COMPLETED
      || run.status === ChatSessionRunStatus.FAILED
      || run.status === ChatSessionRunStatus.CANCELLED
  }
}

async function isRunStatus(
  tx: Prisma.TransactionClient,
  runId: string,
  status: ChatSessionRunStatus,
): Promise<boolean> {
  const run = await tx.chatSessionRun.findUnique({
    where: { runId },
    select: { status: true },
  })

  return run?.status === status
}

async function ignoreUniqueConstraint(write: () => Promise<void>): Promise<void> {
  try {
    await write()
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return
    }

    throw error
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function getSinglePartOrder(type: typeof CHAT_MESSAGE_PART_TYPE.REASONING | typeof CHAT_MESSAGE_PART_TYPE.TEXT): number {
  return type === CHAT_MESSAGE_PART_TYPE.REASONING ? 0 : 1
}

function getExpectedHistoryVersion(value: unknown): number {
  if (!value || typeof value !== 'object') {
    throw new Error('聊天运行上下文无效')
  }

  const expectedHistoryVersion = (value as { expectedHistoryVersion?: unknown }).expectedHistoryVersion
  if (typeof expectedHistoryVersion !== 'number' || !Number.isInteger(expectedHistoryVersion)) {
    throw new TypeError('聊天运行历史版本无效')
  }

  return expectedHistoryVersion
}

function buildCompletedMessageMetadata(input: {
  event: AgentRunEvent
  startedAt: number
  reasoningStartedAt: number | null
  reasoningEndedAt: number | null
}): ChatMessageMetadata {
  const durationMs = getDurationMs(input.event) ?? Date.now() - input.startedAt
  const reasoningElapsedMs = input.reasoningStartedAt && input.reasoningEndedAt
    ? Math.max(0, input.reasoningEndedAt - input.reasoningStartedAt)
    : undefined

  return {
    elapsedMs: durationMs,
    reasoningElapsedMs,
  }
}

function getDurationMs(event: AgentRunEvent): number | null {
  if (!event.payload || typeof event.payload !== 'object') {
    return null
  }

  const durationMs = (event.payload as { durationMs?: unknown }).durationMs
  return typeof durationMs === 'number' && Number.isFinite(durationMs) ? Math.max(0, Math.trunc(durationMs)) : null
}

function getFailureReason(error: unknown): ChatMessageFailureReason {
  if (error instanceof AgentRunEventsConsumerError) {
    return error.reason
  }

  return CHAT_MESSAGE_FAILURE_REASON.FAILED
}

function getFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return '聊天流式响应失败'
}

function getFailureMessageFromEvent(event: AgentRunEvent, fallback: string): string {
  if (event.payload && typeof event.payload === 'object') {
    const message = (event.payload as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  return fallback
}

function readToolResultPayload(event: AgentRunEvent): {
  toolCallId: string
  toolName: string
  content: string
} | null {
  if (!event.payload || typeof event.payload !== 'object') {
    return null
  }

  const payload = event.payload as {
    toolCallId?: unknown
    toolName?: unknown
    content?: unknown
  }
  if (
    typeof payload.toolCallId !== 'string'
    || !payload.toolCallId.trim()
    || typeof payload.toolName !== 'string'
    || !payload.toolName.trim()
    || typeof payload.content !== 'string'
    || !payload.content
  ) {
    return null
  }

  return {
    toolCallId: payload.toolCallId,
    toolName: payload.toolName,
    content: payload.content,
  }
}

function toJsonObject(value: object): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject
}
