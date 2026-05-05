import type { AgentCommandHandler, AgentCommandQueue, AgentEventPublisher, AgentRunCommand, AgentRunEvent } from '../runtime/typing'
import type { AgentRedisClient, RedisCommandArgument, RedisStreamReadResult } from './redis-client'
import process from 'node:process'
import { AGENT_QUEUE_NAME, AgentRunCommandSchema, AgentRunEventSchema } from '@haohaoxue/samepage-contracts'

const DEFAULT_GROUP_NAME = 'samepage-agent'
const DEFAULT_CONSUMER_NAME = `agent-${process.pid}`
const DEFAULT_READ_COUNT = 10
const DEFAULT_READ_BLOCK_MS = 1000
const DEFAULT_MAX_ATTEMPTS = 3
const COMMAND_FIELD = 'command'
const EVENT_FIELD = 'event'

export interface CreateRedisStreamsAgentQueueOptions {
  /** Redis 客户端 */
  redis: AgentRedisClient
}

export interface CreateRedisStreamsAgentEventPublisherOptions {
  /** Redis 客户端 */
  redis: AgentRedisClient
}

export function createRedisStreamsAgentQueue(options: CreateRedisStreamsAgentQueueOptions): AgentCommandQueue {
  const redis = options.redis
  const groupName = DEFAULT_GROUP_NAME
  const consumerName = DEFAULT_CONSUMER_NAME
  const readCount = DEFAULT_READ_COUNT
  const readBlockMs = DEFAULT_READ_BLOCK_MS
  const maxAttempts = DEFAULT_MAX_ATTEMPTS
  let handler: AgentCommandHandler | null = null
  let running = false
  let closed = false

  async function ready(): Promise<void> {
    await ensureConsumerGroup(redis, groupName)
  }

  function subscribe(nextHandler: AgentCommandHandler): () => void {
    handler = nextHandler

    if (!running) {
      running = true
      void consumeLoop()
    }

    return () => {
      handler = null
      running = false
    }
  }

  async function close(): Promise<void> {
    running = false
    closed = true
    await redis.quit()
  }

  async function consumeLoop(): Promise<void> {
    await ready()

    while (true) {
      if (closed || !running) {
        return
      }

      try {
        const handledPending = await readBatch('0', false)

        if (handledPending) {
          continue
        }

        const handledNew = await readBatch('>', true)

        if (!handledNew) {
          await sleep(readBlockMs)
        }
      }
      catch {
        if (closed || !running) {
          return
        }

        await sleep(readBlockMs)
      }
    }
  }

  async function readBatch(streamId: string, block: boolean): Promise<boolean> {
    const result = await readCommandBatch(redis, {
      groupName,
      consumerName,
      readCount,
      readBlockMs,
      streamId,
      block,
    })

    if (!result?.length) {
      return false
    }

    const currentHandler = handler
    if (!currentHandler) {
      return false
    }

    let handledMessage = false

    for (const [, messages] of result) {
      for (const [messageId, fields] of messages) {
        handledMessage = true
        await handleMessage(messageId, fields, currentHandler)
      }
    }

    return handledMessage
  }

  async function handleMessage(
    messageId: string,
    fields: string[],
    currentHandler: AgentCommandHandler,
  ): Promise<void> {
    const rawCommand = getStreamField(fields, COMMAND_FIELD)

    if (!rawCommand) {
      await publishDeadLetter(redis, {
        messageId,
        rawCommand: '',
        errorMessage: 'command 字段缺失',
        attempts: 0,
      })
      await redis.xack(AGENT_QUEUE_NAME.COMMANDS, groupName, messageId)
      return
    }

    const command = parseCommand(rawCommand)
    if (!command.ok) {
      await publishDeadLetter(redis, {
        messageId,
        rawCommand,
        errorMessage: command.errorMessage,
        attempts: 0,
      })
      await redis.xack(AGENT_QUEUE_NAME.COMMANDS, groupName, messageId)
      return
    }

    let lastErrorMessage = 'Agent command failed'

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await currentHandler(command.value)
        await redis.xack(AGENT_QUEUE_NAME.COMMANDS, groupName, messageId)
        return
      }
      catch (error) {
        lastErrorMessage = getErrorMessage(error)
      }
    }

    await publishDeadLetter(redis, {
      messageId,
      rawCommand,
      errorMessage: lastErrorMessage,
      attempts: maxAttempts,
    })
    await redis.xack(AGENT_QUEUE_NAME.COMMANDS, groupName, messageId)
  }

  return {
    async publish(command) {
      await publishCommand(redis, command)
    },
    subscribe,
    ready,
    close,
  }
}

export function createRedisStreamsAgentEventPublisher(
  options: CreateRedisStreamsAgentEventPublisherOptions,
): AgentEventPublisher {
  const redis = options.redis

  return {
    async publish(event) {
      await publishEvent(redis, event)
    },

    async close() {
      await redis.quit()
    },
  }
}

async function ensureConsumerGroup(redis: AgentRedisClient, groupName: string): Promise<void> {
  try {
    await redis.xgroup('CREATE', AGENT_QUEUE_NAME.COMMANDS, groupName, '0', 'MKSTREAM')
  }
  catch (error) {
    if (!isBusyGroupError(error)) {
      throw error
    }
  }
}

function readCommandBatch(
  redis: AgentRedisClient,
  options: {
    groupName: string
    consumerName: string
    readCount: number
    readBlockMs: number
    streamId: string
    block: boolean
  },
): Promise<RedisStreamReadResult | null> {
  const baseArgs: RedisCommandArgument[] = [
    'GROUP',
    options.groupName,
    options.consumerName,
    'COUNT',
    options.readCount,
  ]

  if (options.block) {
    baseArgs.push('BLOCK', options.readBlockMs)
  }

  return redis.xreadgroup(
    ...baseArgs,
    'STREAMS',
    AGENT_QUEUE_NAME.COMMANDS,
    options.streamId,
  )
}

function publishCommand(redis: AgentRedisClient, command: AgentRunCommand): Promise<string> {
  return redis.xadd(
    AGENT_QUEUE_NAME.COMMANDS,
    '*',
    COMMAND_FIELD,
    JSON.stringify(command),
  )
}

function publishEvent(redis: AgentRedisClient, event: AgentRunEvent): Promise<string> {
  const normalizedEvent = AgentRunEventSchema.parse(event)

  return redis.xadd(
    AGENT_QUEUE_NAME.EVENTS,
    '*',
    EVENT_FIELD,
    JSON.stringify(normalizedEvent),
  )
}

function publishDeadLetter(
  redis: AgentRedisClient,
  options: {
    messageId: string
    rawCommand: string
    errorMessage: string
    attempts: number
  },
): Promise<string> {
  return redis.xadd(
    AGENT_QUEUE_NAME.DEAD_LETTER,
    '*',
    'originalId',
    options.messageId,
    COMMAND_FIELD,
    options.rawCommand,
    'error',
    options.errorMessage,
    'attempts',
    String(options.attempts),
  )
}

function getStreamField(fields: string[], fieldName: string): string | null {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === fieldName) {
      return fields[index + 1] ?? null
    }
  }

  return null
}

function parseCommand(rawCommand: string): { ok: true, value: AgentRunCommand } | { ok: false, errorMessage: string } {
  try {
    return {
      ok: true,
      value: AgentRunCommandSchema.parse(JSON.parse(rawCommand)),
    }
  }
  catch (error) {
    return {
      ok: false,
      errorMessage: getErrorMessage(error),
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function isBusyGroupError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('BUSYGROUP')
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, durationMs)
    timeout.unref?.()
  })
}
