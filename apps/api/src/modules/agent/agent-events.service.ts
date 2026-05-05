import type { AgentRunEvent, AgentWorkflowKey } from '@haohaoxue/samepage-contracts'
import type Redis from 'ioredis'
import { AGENT_QUEUE_NAME, AGENT_RUN_EVENT_TYPE, AgentRunEventSchema } from '@haohaoxue/samepage-contracts'
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common'
import { RedisService } from '../../infrastructure/redis/redis.service'

const EVENT_FIELD = 'event'
const DEFAULT_READ_COUNT = 20
const DEFAULT_READ_BLOCK_MS = 1000
const DEFAULT_RUN_TIMEOUT_MS = 10 * 60_000
const EMPTY_STREAM_ID = '0-0'

type RedisStreamMessage = [string, string[]]
type RedisStreamReadResult = Array<[string, RedisStreamMessage[]]>

export interface ConsumeAgentRunEventsInput {
  runId: string
  workflowKey: AgentWorkflowKey
  afterId: string
  timeoutMs?: number
  signal?: AbortSignal
  messages?: AgentRunEventConsumerMessages
  onTextDelta: (chunk: string) => void | Promise<void>
}

export interface AgentRunEventConsumerMessages {
  aborted?: string
  cancelled?: string
  timedOut?: string
  failed?: string
}

@Injectable()
export class AgentRunEventsService {
  constructor(private readonly redisService: RedisService) {}

  async getLatestEventStreamId(): Promise<string> {
    const result = await this.redisService.getClient().xrevrange(
      AGENT_QUEUE_NAME.EVENTS,
      '+',
      '-',
      'COUNT',
      1,
    ) as Array<[string, string[]]>

    return result[0]?.[0] ?? EMPTY_STREAM_ID
  }

  async consumeRunEvents(input: ConsumeAgentRunEventsInput): Promise<void> {
    const redis = this.redisService.createClient()

    try {
      await this.consumeRunEventsWithClient(redis, input)
    }
    finally {
      await closeRedis(redis)
    }
  }

  private async consumeRunEventsWithClient(
    redis: Redis,
    input: ConsumeAgentRunEventsInput,
  ): Promise<void> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS
    const deadlineAt = Date.now() + timeoutMs
    const messages = normalizeMessages(input.messages)
    let lastId = input.afterId

    while (Date.now() < deadlineAt) {
      if (input.signal?.aborted) {
        throw new BadGatewayException(messages.aborted)
      }

      const remainingMs = Math.max(1, deadlineAt - Date.now())
      const result = await readNextBatch(redis, lastId, Math.min(DEFAULT_READ_BLOCK_MS, remainingMs))

      if (!result?.length) {
        continue
      }

      for (const [, streamMessages] of result) {
        for (const [messageId, fields] of streamMessages) {
          lastId = messageId
          const event = parseEvent(fields)

          if (!event || event.runId !== input.runId || event.workflowKey !== input.workflowKey) {
            continue
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.TEXT_DELTA) {
            const text = getTextDelta(event)
            if (text) {
              await input.onTextDelta(text)
            }
            continue
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.RUN_COMPLETED) {
            return
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.RUN_FAILED) {
            throw new BadGatewayException(getFailureMessage(event, messages.failed))
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.RUN_CANCELLED) {
            throw new BadGatewayException(messages.cancelled)
          }

          if (event.type === AGENT_RUN_EVENT_TYPE.RUN_TIMED_OUT) {
            throw new GatewayTimeoutException(messages.timedOut)
          }
        }
      }
    }

    throw new GatewayTimeoutException(messages.timedOut)
  }
}

function readNextBatch(
  redis: Redis,
  afterId: string,
  blockMs: number,
): Promise<RedisStreamReadResult | null> {
  return redis.xread(
    'COUNT',
    DEFAULT_READ_COUNT,
    'BLOCK',
    blockMs,
    'STREAMS',
    AGENT_QUEUE_NAME.EVENTS,
    afterId,
  ) as Promise<RedisStreamReadResult | null>
}

function parseEvent(fields: string[]): AgentRunEvent | null {
  const rawEvent = getStreamField(fields, EVENT_FIELD)
  if (!rawEvent) {
    return null
  }

  try {
    return AgentRunEventSchema.parse(JSON.parse(rawEvent))
  }
  catch {
    return null
  }
}

function getStreamField(fields: string[], fieldName: string): string | null {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === fieldName) {
      return fields[index + 1] ?? null
    }
  }

  return null
}

function getTextDelta(event: AgentRunEvent): string | null {
  if (!event.payload || typeof event.payload !== 'object') {
    return null
  }

  const text = (event.payload as { text?: unknown }).text
  return typeof text === 'string' ? text : null
}

function getFailureMessage(event: AgentRunEvent, fallback: string): string {
  if (event.payload && typeof event.payload === 'object') {
    const message = (event.payload as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  return fallback
}

function normalizeMessages(messages: AgentRunEventConsumerMessages = {}): Required<AgentRunEventConsumerMessages> {
  return {
    aborted: messages.aborted ?? 'Agent 请求已取消',
    cancelled: messages.cancelled ?? 'Agent 运行已取消',
    timedOut: messages.timedOut ?? '等待 Agent 运行结果超时',
    failed: messages.failed ?? 'Agent 运行失败',
  }
}

async function closeRedis(redis: Redis): Promise<void> {
  try {
    await redis.quit()
  }
  catch {
    redis.disconnect()
  }
}
