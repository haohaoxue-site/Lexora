import type { CollabPubSubMessage } from '@haohaoxue/lexora-contracts'
import { COLLAB_REDIS_CHANNEL, CollabPubSubMessageSchema } from '@haohaoxue/lexora-contracts'
import Redis from 'ioredis'

export type CollabPubSubHandler = (message: CollabPubSubMessage) => Promise<void> | void

/** 协作多实例广播通道。 */
export interface CollabPubSub {
  publish: (message: CollabPubSubMessage) => Promise<void>
  subscribe: (handler: CollabPubSubHandler) => () => void
  ready?: () => Promise<void>
  close?: () => Promise<void>
}

type RedisMessageHandler = (channel: string, payload: string) => void

interface RedisPubSubClient {
  publish: (channel: string, payload: string) => Promise<unknown>
  subscribe: (channel: string) => Promise<unknown>
  unsubscribe: (channel: string) => Promise<unknown>
  quit: () => Promise<unknown>
  disconnect?: () => void
  on: (event: 'message', handler: RedisMessageHandler) => unknown
  off: (event: 'message', handler: RedisMessageHandler) => unknown
}

/** 创建 Redis Pub/Sub 输入。 */
export interface CreateRedisCollabPubSubInput {
  redisUrl: string
  publisher?: RedisPubSubClient
  subscriber?: RedisPubSubClient
}

export function createRedisCollabPubSub(input: CreateRedisCollabPubSubInput): CollabPubSub {
  const publisher = input.publisher ?? createRedisClient(input.redisUrl)
  const subscriber = input.subscriber ?? createRedisClient(input.redisUrl)
  const handlers = new Set<CollabPubSubHandler>()
  const channel = COLLAB_REDIS_CHANNEL.PERMISSION_INVALIDATION
  let subscribed = false
  let subscribePromise: Promise<void> | null = null
  const onMessage: RedisMessageHandler = (messageChannel, payload) => {
    if (messageChannel !== channel) {
      return
    }

    const message = parseRedisMessage(payload)

    if (!message) {
      return
    }

    void Promise.all(Array.from(handlers).map(async handler => await handler(message)))
  }

  async function ensureSubscribed(): Promise<void> {
    if (subscribed || handlers.size === 0) {
      return
    }

    subscribePromise ??= (async () => {
      subscriber.on('message', onMessage)
      await subscriber.subscribe(channel)
      subscribed = true
    })().finally(() => {
      subscribePromise = null
    })
    await subscribePromise
  }

  return {
    async publish(message) {
      await publisher.publish(channel, JSON.stringify(CollabPubSubMessageSchema.parse(message)))
    },

    subscribe(handler) {
      handlers.add(handler)

      return () => {
        handlers.delete(handler)
      }
    },

    async ready() {
      await ensureSubscribed()
    },

    async close() {
      if (subscribed) {
        subscriber.off('message', onMessage)
        await subscriber.unsubscribe(channel)
        subscribed = false
      }

      await Promise.all([
        closeRedisClient(subscriber),
        closeRedisClient(publisher),
      ])
    },
  }
}

function createRedisClient(redisUrl: string): RedisPubSubClient {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  })
}

function parseRedisMessage(payload: string) {
  try {
    return CollabPubSubMessageSchema.parse(JSON.parse(payload))
  }
  catch {
    return null
  }
}

async function closeRedisClient(client: RedisPubSubClient): Promise<void> {
  try {
    await client.quit()
  }
  catch {
    client.disconnect?.()
  }
}
