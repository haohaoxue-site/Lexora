import type {
  AgentRunCommand,
  AgentRunEvent,
  ChatMessageFailureReason,
  ChatMessageMetadata,
  ChatStreamEvent,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import {
  AGENT_RUN_EVENT_TYPE,
  CHAT_MESSAGE_FAILURE_REASON,
  CHAT_MESSAGE_PART_TYPE,
  CHAT_STREAM_EVENT_TYPE,
  ChatStreamEventSchema,
  STREAM_DONE_PAYLOAD,
} from '@haohaoxue/samepage-contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AgentRunEventsConsumerError,
  AgentRunEventsService,
  getAgentRunEventText,
} from '../agent/agent-events.service'
import { ChatSessionsService } from './chat-sessions.service'

const PART_FLUSH_INTERVAL_MS = 1000
const PART_FLUSH_TEXT_THRESHOLD = 512

export interface ProjectChatRunToReplyInput {
  reply: FastifyReply
  command: AgentRunCommand
  sessionId: string
  messageId: string
  expectedHistoryVersion: number
  start: () => Promise<void>
}

@Injectable()
export class ChatRunProjectorService {
  private readonly logger = new Logger(ChatRunProjectorService.name)

  constructor(
    private readonly agentRunEventsService: AgentRunEventsService,
    private readonly chatSessionsService: ChatSessionsService,
  ) {}

  async projectRunToReply(input: ProjectChatRunToReplyInput): Promise<void> {
    const startedAt = Date.now()
    let reasoningText = ''
    let answerText = ''
    let flushedReasoningText = ''
    let flushedAnswerText = ''
    let reasoningStartedAt: number | null = null
    let reasoningEndedAt: number | null = null
    let completed = false
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let flushQueue: Promise<void> = Promise.resolve()

    const clearFlushTimer = () => {
      if (!flushTimer) {
        return
      }

      clearTimeout(flushTimer)
      flushTimer = null
    }

    const flushParts = async (): Promise<void> => {
      clearFlushTimer()

      const task = flushQueue.then(async () => {
        if (reasoningText && reasoningText !== flushedReasoningText) {
          await this.chatSessionsService.upsertMessagePartText({
            messageId: input.messageId,
            type: CHAT_MESSAGE_PART_TYPE.REASONING,
            text: reasoningText,
          })
          flushedReasoningText = reasoningText
        }

        if (answerText && answerText !== flushedAnswerText) {
          await this.chatSessionsService.upsertMessagePartText({
            messageId: input.messageId,
            type: CHAT_MESSAGE_PART_TYPE.TEXT,
            text: answerText,
          })
          flushedAnswerText = answerText
        }
      })

      flushQueue = task.catch(() => {})
      await task
    }

    const scheduleFlush = () => {
      if (flushTimer) {
        return
      }

      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushParts().catch(error => this.logger.error(
          error instanceof Error ? error.message : 'flush chat stream parts failed',
          error instanceof Error ? error.stack : undefined,
        ))
      }, PART_FLUSH_INTERVAL_MS)
    }

    const flushIfNeeded = async () => {
      const shouldFlush
        = reasoningText.length - flushedReasoningText.length >= PART_FLUSH_TEXT_THRESHOLD
          || answerText.length - flushedAnswerText.length >= PART_FLUSH_TEXT_THRESHOLD

      if (shouldFlush) {
        await flushParts()
        return
      }

      scheduleFlush()
    }

    this.writeEvent(input.reply, {
      type: CHAT_STREAM_EVENT_TYPE.MESSAGE_STARTED,
      runId: input.command.runId,
      messageId: input.messageId,
      role: 'assistant',
    })

    try {
      const afterId = await this.agentRunEventsService.getLatestEventStreamId()
      await input.start()

      await this.agentRunEventsService.consumeRunEvents({
        runId: input.command.runId,
        workflowKey: input.command.workflowKey,
        afterId,
        messages: {
          aborted: '聊天请求已取消',
          cancelled: '聊天运行已取消',
          timedOut: '等待聊天运行结果超时',
          failed: '聊天运行失败',
        },
        onEvent: async (event) => {
          if (event.type === AGENT_RUN_EVENT_TYPE.REASONING_DELTA) {
            const text = getAgentRunEventText(event)
            if (!text) {
              return
            }

            reasoningStartedAt ??= Date.now()
            reasoningEndedAt = Date.now()
            reasoningText += text
            this.writeEvent(input.reply, {
              type: CHAT_STREAM_EVENT_TYPE.REASONING_DELTA,
              runId: input.command.runId,
              messageId: input.messageId,
              text,
            })
            await flushIfNeeded()
            return
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.TEXT_DELTA) {
            const text = getAgentRunEventText(event)
            if (!text) {
              return
            }

            answerText += text
            this.writeEvent(input.reply, {
              type: CHAT_STREAM_EVENT_TYPE.TEXT_DELTA,
              runId: input.command.runId,
              messageId: input.messageId,
              text,
            })
            await flushIfNeeded()
            return
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.RUN_COMPLETED) {
            await flushParts()
            await this.chatSessionsService.completeAssistantMessage({
              sessionId: input.sessionId,
              messageId: input.messageId,
              content: answerText,
              expectedHistoryVersion: input.expectedHistoryVersion,
              metadata: buildCompletedMessageMetadata({
                event,
                startedAt,
                reasoningStartedAt,
                reasoningEndedAt,
              }),
            })
            this.writeEvent(input.reply, {
              type: CHAT_STREAM_EVENT_TYPE.MESSAGE_COMPLETED,
              runId: input.command.runId,
              messageId: input.messageId,
              content: answerText,
            })
            this.writeEvent(input.reply, {
              type: CHAT_STREAM_EVENT_TYPE.RUN_COMPLETED,
              runId: input.command.runId,
            })
            completed = true
          }
        },
      })

      if (completed) {
        this.writeDone(input.reply)
      }
    }
    catch (error) {
      clearFlushTimer()
      await flushParts().catch(flushError => this.logger.error(
        flushError instanceof Error ? flushError.message : 'flush chat stream parts failed',
        flushError instanceof Error ? flushError.stack : undefined,
      ))

      const failureReason = getFailureReason(error)
      const failureMessage = getFailureMessage(error)

      await this.chatSessionsService.failAssistantMessage({
        messageId: input.messageId,
        failureReason,
        failureMessage,
      }).catch(statusError => this.logger.error(
        statusError instanceof Error ? statusError.message : 'mark chat message failed',
        statusError instanceof Error ? statusError.stack : undefined,
      ))

      this.logger.error(
        error instanceof Error ? error.message : 'chat completion stream failed',
        error instanceof Error ? error.stack : undefined,
      )
      this.writeEvent(input.reply, {
        type: CHAT_STREAM_EVENT_TYPE.ERROR,
        runId: input.command.runId,
        message: failureMessage,
        code: failureReason,
      })
    }
    finally {
      clearFlushTimer()
    }
  }

  private writeEvent(reply: FastifyReply, event: ChatStreamEvent): void {
    const payload = JSON.stringify(ChatStreamEventSchema.parse(event))
    if (!isReplyWritable(reply)) {
      return
    }

    try {
      reply.raw.write(`data: ${payload}\n\n`)
    }
    catch {

    }
  }

  private writeDone(reply: FastifyReply): void {
    if (!isReplyWritable(reply)) {
      return
    }

    try {
      reply.raw.write(`data: ${STREAM_DONE_PAYLOAD}\n\n`)
    }
    catch {

    }
  }
}

function isReplyWritable(reply: FastifyReply): boolean {
  return !reply.raw.destroyed && !reply.raw.writableEnded
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
