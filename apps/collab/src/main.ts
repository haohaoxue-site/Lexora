import process from 'node:process'
import { createCollabTicketClient, createDocumentYdocCurrentProjectionClient } from './clients/documents'
import { loadCollabConfig } from './config/runtime-config'
import { createRedisCollabPubSub } from './integrations/pubsub'
import { createPrismaDocumentYdocRuntimeStore } from './runtime/prisma-ydoc-runtime-store'
import { createCollabServer } from './server/app'

const config = loadCollabConfig()
const ydocRuntimeStore = createPrismaDocumentYdocRuntimeStore({
  databaseUrl: config.databaseUrl,
})
const currentProjectionClient = createDocumentYdocCurrentProjectionClient({
  apiInternalUrl: config.apiInternalUrl,
  appInternalKey: config.appInternalKey,
})
const ticketClient = createCollabTicketClient({
  apiInternalUrl: config.apiInternalUrl,
  appInternalKey: config.appInternalKey,
})
const pubSub = createRedisCollabPubSub({
  redisUrl: config.redisUrl,
})
const apiPrefix = 'collab'
const app = createCollabServer({
  config,
  ydocRuntimeStore,
  currentProjectionClient,
  ticketClient,
  pubSub,
})

async function start(): Promise<void> {
  const appUrl = await app.listen({
    host: config.host,
    port: config.port,
  })

  app.log.info(`Collab is running on ${appUrl}/${apiPrefix}`)
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Collab is shutting down')
  await app.close()
}

process.once('SIGTERM', signal => void shutdown(signal))
process.once('SIGINT', signal => void shutdown(signal))

void start()
