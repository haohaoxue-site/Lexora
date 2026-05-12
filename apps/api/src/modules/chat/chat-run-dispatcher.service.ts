import type {
  AgentRunCommand,
  AgentRunModelTarget,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_WORKFLOW_KEY,
  AgentChatReplyContextSchema,
  AgentRunCommandSchema,
  AgentRunModelTargetSchema,
  CHAT_MESSAGE_FAILURE_REASON,
  CHAT_SESSION_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import {
  ChatSessionMessageStatus,
  ChatSessionRunStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AgentRunCommandPublisherService } from '../agent/agent-command-publisher.service'
import { AgentRunEventsService } from '../agent/agent-events.service'
import { ChatRunProjectorService } from './chat-run-projector.service'
import { ChatSessionEventsService } from './chat-session-events.service'

const DISPATCH_INTERVAL_MS = 1500
const DISPATCH_BATCH_SIZE = 5
const DISPATCH_LEASE_MS = 60_000
const EMPTY_AGENT_EVENT_STREAM_ID = '0-0'

interface DispatchableChatRun {
  runId: string
  sessionId: string
  assistantMessageId: string
  triggerUserMessageId: string
  actorUserId: string
  workflowKey: string
  status: ChatSessionRunStatus
  commandPublishedAt: Date | null
  dispatchLeaseExpiresAt: Date | null
  modelTargetSnapshot: unknown
  commandContext: unknown
}

@Injectable()
export class ChatRunDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRunDispatcherService.name)
  private dispatchTimer: ReturnType<typeof setInterval> | null = null
  private dispatching = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRunCommandPublisher: AgentRunCommandPublisherService,
    private readonly agentRunEventsService: AgentRunEventsService,
    private readonly chatSessionEvents: ChatSessionEventsService,
    private readonly chatRunProjector: ChatRunProjectorService,
  ) {}

  onModuleInit(): void {
    this.dispatchTimer = setInterval(() => {
      void this.dispatchPendingRuns().catch(error => this.logger.error(
        error instanceof Error ? error.message : 'dispatch pending chat runs failed',
        error instanceof Error ? error.stack : undefined,
      ))
    }, DISPATCH_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (!this.dispatchTimer) {
      return
    }

    clearInterval(this.dispatchTimer)
    this.dispatchTimer = null
  }

  async dispatchRun(runId: string): Promise<void> {
    const now = new Date()
    const run = await this.getDispatchableRun(runId, now)
    if (!run) {
      return
    }

    const command = buildRunCommand(run)
    const afterId = await this.getProjectionAfterId(run)
    const claimed = await this.claimRun(run, now)

    if (!claimed) {
      return
    }

    try {
      await this.agentRunCommandPublisher.publishRunCommand(command)
    }
    catch (error) {
      await this.markRunFailed({
        runId: run.runId,
        sessionId: run.sessionId,
        assistantMessageId: run.assistantMessageId,
        message: error instanceof Error ? error.message : '发布聊天运行命令失败',
      })
      return
    }

    const commandPublished = await this.markCommandPublished(run.runId)
    if (!commandPublished) {
      return
    }

    this.logger.log(`chat run command published: session=${run.sessionId} run=${run.runId}`)
    void this.chatRunProjector.projectRun({
      runId: run.runId,
      afterId,
    }).catch(error => this.logger.error(
      error instanceof Error ? error.message : 'project chat run failed',
      error instanceof Error ? error.stack : undefined,
    ))
  }

  async dispatchPendingRuns(): Promise<void> {
    if (this.dispatching) {
      return
    }

    this.dispatching = true
    try {
      const now = new Date()
      const runs = await this.prisma.chatSessionRun.findMany({
        where: {
          OR: [
            { status: ChatSessionRunStatus.PENDING },
            {
              commandPublishedAt: null,
              dispatchLeaseExpiresAt: {
                lt: now,
              },
              status: ChatSessionRunStatus.RUNNING,
            },
          ],
        },
        select: {
          runId: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: DISPATCH_BATCH_SIZE,
      })

      for (const run of runs) {
        await this.dispatchRun(run.runId)
      }
    }
    finally {
      this.dispatching = false
    }
  }

  private async getDispatchableRun(runId: string, now: Date): Promise<DispatchableChatRun | null> {
    return this.prisma.chatSessionRun.findFirst({
      where: {
        runId,
        OR: [
          { status: ChatSessionRunStatus.PENDING },
          {
            commandPublishedAt: null,
            dispatchLeaseExpiresAt: {
              lt: now,
            },
            status: ChatSessionRunStatus.RUNNING,
          },
        ],
      },
      select: {
        runId: true,
        sessionId: true,
        assistantMessageId: true,
        triggerUserMessageId: true,
        actorUserId: true,
        workflowKey: true,
        status: true,
        commandPublishedAt: true,
        dispatchLeaseExpiresAt: true,
        modelTargetSnapshot: true,
        commandContext: true,
      },
    })
  }

  private async getProjectionAfterId(run: DispatchableChatRun): Promise<string> {
    if (run.status === ChatSessionRunStatus.RUNNING) {
      return await this.chatSessionEvents.getLatestSourceEventStreamId(run.runId) ?? EMPTY_AGENT_EVENT_STREAM_ID
    }

    return this.agentRunEventsService.getLatestEventStreamId()
  }

  private async claimRun(run: DispatchableChatRun, now: Date): Promise<boolean> {
    if (run.status === ChatSessionRunStatus.RUNNING) {
      return this.reclaimRun(run, now)
    }

    const dispatchLeaseExpiresAt = new Date(now.getTime() + DISPATCH_LEASE_MS)
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.chatSessionRun.updateMany({
        where: {
          runId: run.runId,
          status: ChatSessionRunStatus.PENDING,
        },
        data: {
          status: ChatSessionRunStatus.RUNNING,
          startedAt: now,
          dispatchLeaseExpiresAt,
        },
      })

      if (update.count === 0) {
        return false
      }

      await tx.chatSessionMessage.update({
        where: { id: run.assistantMessageId },
        data: {
          status: ChatSessionMessageStatus.STREAMING,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, run.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_STARTED,
          runId: run.runId,
          payload: {},
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_STATUS_CHANGED,
          messageId: run.assistantMessageId,
          runId: run.runId,
          payload: {
            status: 'streaming',
          },
        },
      ])

      return true
    })
  }

  private async reclaimRun(run: DispatchableChatRun, now: Date): Promise<boolean> {
    const dispatchLeaseExpiresAt = new Date(now.getTime() + DISPATCH_LEASE_MS)
    const update = await this.prisma.chatSessionRun.updateMany({
      where: {
        commandPublishedAt: null,
        dispatchLeaseExpiresAt: {
          lt: now,
        },
        runId: run.runId,
        status: ChatSessionRunStatus.RUNNING,
      },
      data: {
        dispatchLeaseExpiresAt,
      },
    })

    return update.count > 0
  }

  private async markCommandPublished(runId: string): Promise<boolean> {
    const commandPublishedAt = new Date()
    const update = await this.prisma.chatSessionRun.updateMany({
      where: {
        commandPublishedAt: null,
        runId,
      },
      data: {
        commandPublishedAt,
        dispatchLeaseExpiresAt: null,
      },
    })

    return update.count > 0
  }

  private async markRunFailed(input: {
    runId: string
    sessionId: string
    assistantMessageId: string
    message: string
  }): Promise<void> {
    const completedAt = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.chatSessionRun.updateMany({
        where: {
          runId: input.runId,
        },
        data: {
          status: ChatSessionRunStatus.FAILED,
          completedAt,
          dispatchLeaseExpiresAt: null,
        },
      })
      await tx.chatSessionMessage.updateMany({
        where: {
          id: input.assistantMessageId,
        },
        data: {
          status: ChatSessionMessageStatus.FAILED,
          metadata: toJsonObject({
            failureReason: CHAT_MESSAGE_FAILURE_REASON.FAILED,
            failureMessage: input.message,
          }),
          completedAt,
        },
      })
      await this.chatSessionEvents.appendEvents(tx, input.sessionId, [
        {
          type: CHAT_SESSION_EVENT_TYPE.RUN_FAILED,
          runId: input.runId,
          payload: {
            message: input.message,
          },
        },
        {
          type: CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED,
          messageId: input.assistantMessageId,
          runId: input.runId,
          payload: {
            message: input.message,
          },
        },
      ])
    })
  }
}

function buildRunCommand(run: {
  runId: string
  sessionId: string
  assistantMessageId: string
  triggerUserMessageId: string
  actorUserId: string
  workflowKey: string
  modelTargetSnapshot: unknown
  commandContext: unknown
}): AgentRunCommand {
  const modelTarget = AgentRunModelTargetSchema.parse(run.modelTargetSnapshot) satisfies AgentRunModelTarget
  const commandContext = getCommandContext(run.commandContext)
  const context = AgentChatReplyContextSchema.parse({
    chatSessionId: run.sessionId,
    triggerUserMessageId: run.triggerUserMessageId,
    assistantMessageId: run.assistantMessageId,
    expectedHistoryVersion: commandContext.expectedHistoryVersion,
  })

  return AgentRunCommandSchema.parse({
    commandId: randomUUID(),
    runId: run.runId,
    workflowKey: AGENT_WORKFLOW_KEY.CHAT_REPLY,
    actorId: run.actorUserId,
    modelTarget,
    context,
    idempotencyKey: `${AGENT_WORKFLOW_KEY.CHAT_REPLY}:${run.runId}`,
  })
}

function getCommandContext(value: unknown): { expectedHistoryVersion: number } {
  if (!value || typeof value !== 'object') {
    throw new Error('聊天运行上下文无效')
  }

  const expectedHistoryVersion = (value as { expectedHistoryVersion?: unknown }).expectedHistoryVersion
  if (typeof expectedHistoryVersion !== 'number' || !Number.isInteger(expectedHistoryVersion)) {
    throw new TypeError('聊天运行历史版本无效')
  }

  return { expectedHistoryVersion }
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject
}
