import process from 'node:process'
import { createAgentChatApiClient } from './clients/chat'
import { createAgentEditorApiClient } from './clients/editor'
import { loadAgentConfig } from './config/runtime-config'
import { createChatModelFactory } from './integrations/model-providers/chat-model'
import { createAgentRedisClient } from './integrations/redis-client'
import { createRedisStreamsAgentEventPublisher, createRedisStreamsAgentQueue } from './integrations/redis-streams'
import { createAgentRuntime } from './runtime'
import { createAgentServer } from './server/app'
import { createChatReplyWorkflow } from './workflows/chat-reply'
import { createEditorGenerateWorkflow, createEditorRewriteWorkflow } from './workflows/editor-reply'

const config = loadAgentConfig()
const chatApi = createAgentChatApiClient(config.apiInternalUrl)
const editorApi = createAgentEditorApiClient(config.apiInternalUrl)
const chatModelFactory = createChatModelFactory()
const commandRedis = createAgentRedisClient(config.redisUrl)
const eventRedis = createAgentRedisClient(config.redisUrl)

const agentRuntime = createAgentRuntime({
  queue: createRedisStreamsAgentQueue({
    redis: commandRedis,
  }),
  events: createRedisStreamsAgentEventPublisher({
    redis: eventRedis,
  }),
  workflows: [
    createChatReplyWorkflow({ chatApi, chatModelFactory }),
    createEditorGenerateWorkflow({ editorApi, chatModelFactory }),
    createEditorRewriteWorkflow({ editorApi, chatModelFactory }),
  ],
})

const app = createAgentServer({
  config,
  lifecycle: {
    flushBeforeClose: () => agentRuntime.stop(),
  },
})

async function start(): Promise<void> {
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
