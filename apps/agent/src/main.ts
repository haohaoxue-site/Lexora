import process from 'node:process'
import { createAgentChatApiClient } from './clients/chat'
import { loadAgentConfig } from './config/runtime-config'
import { createAgentRunner } from './core'
import { createChatModelFactory } from './integrations/model-providers/chat-model'
import { createAgentRedisClient } from './integrations/redis-client'
import { createRedisAgentRuntimeTryLock } from './integrations/redis-lock'
import {
  createRedisAgentIdempotencyStore,
  createRedisStreamsAgentControlResultPublisher,
  createRedisStreamsAgentEventPublisher,
  createRedisStreamsAgentQueue,
} from './integrations/redis-streams'
import { createAgentRuntime } from './runtime'
import { createCheckpointRetentionManager } from './runtime/checkpoint-retention'
import { closeAgentCheckpointer, createAgentCheckpointer } from './runtime/checkpointer'
import { createAgentServer } from './server/app'

const config = loadAgentConfig()
const chatApi = createAgentChatApiClient(config.apiInternalUrl)
const chatModelFactory = createChatModelFactory()
const queueRedis = createAgentRedisClient(config.redisUrl)
const runtimeRedis = createAgentRedisClient(config.redisUrl)
const eventRedis = createAgentRedisClient(config.redisUrl)
let agentRuntime: ReturnType<typeof createAgentRuntime> | null = null
let agentCheckpointer: Awaited<ReturnType<typeof createAgentCheckpointer>> | null = null
let checkpointRetentionManager: ReturnType<typeof createCheckpointRetentionManager> | null = null

const app = createAgentServer({
  config,
  lifecycle: {
    flushBeforeClose: async () => {
      await checkpointRetentionManager?.stop()
      await agentRuntime?.stop()
      await Promise.allSettled([
        runtimeRedis.quit(),
        queueRedis.quit(),
        eventRedis.quit(),
      ])
      await closeAgentCheckpointer(agentCheckpointer)
    },
  },
})

async function start(): Promise<void> {
  agentCheckpointer = await createAgentCheckpointer(config.checkpointer)
  const threadRunTryLock = createRedisAgentRuntimeTryLock({
    redis: runtimeRedis,
    keyPrefix: 'samepage:agent:thread-lock:',
  })
  checkpointRetentionManager = createCheckpointRetentionManager({
    checkpointer: agentCheckpointer,
    retentionDays: config.checkpointer.retentionDays,
    lock: createRedisAgentRuntimeTryLock({
      redis: runtimeRedis,
      keyPrefix: 'samepage:agent:lock:',
    }),
    threadLock: threadRunTryLock,
    controlResults: createRedisStreamsAgentControlResultPublisher({
      redis: eventRedis,
    }),
    logger: app.log,
  })
  const eventPublisher = createRedisStreamsAgentEventPublisher({
    redis: eventRedis,
  })
  agentRuntime = createAgentRuntime({
    runner: createAgentRunner({
      chatApi,
      chatModelFactory,
      checkpointer: agentCheckpointer,
      events: eventPublisher,
      threadRunTryLock,
    }),
    idempotency: createRedisAgentIdempotencyStore({
      redis: runtimeRedis,
    }),
    queue: createRedisStreamsAgentQueue({
      redis: queueRedis,
    }),
    events: eventPublisher,
    onControl: async control => await checkpointRetentionManager?.handleControl(control),
  })

  checkpointRetentionManager.start()
  await agentRuntime.start()
  const appUrl = await app.listen({
    host: config.host,
    port: config.port,
  })

  app.log.info(`Agent is running on ${appUrl}`)
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Agent is shutting down')
  await app.close()
}

process.once('SIGTERM', signal => void shutdown(signal))
process.once('SIGINT', signal => void shutdown(signal))

void start()
