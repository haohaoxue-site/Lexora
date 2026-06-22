import type { FastifyInstance } from 'fastify'
import type { CollabTicketClient, DocumentYdocCurrentProjectionClient } from '../clients/documents'
import type { CollabConfig } from '../config/runtime-config'
import type { CollabPubSub } from '../integrations/pubsub'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { CollabHocuspocusRuntime } from '../runtime/ports'
import type { DocumentYdocRuntimeStore } from '../runtime/ydoc-runtime-store'
import type { CollabServerLifecycle } from './lifecycle'
import { randomUUID } from 'node:crypto'
import websocket from '@fastify/websocket'
import fastify from 'fastify'
import { createCollabActiveConnectionRegistry } from '../gateway/active-connections'
import { createConnectionGate, createFixedWindowRateLimiter } from '../gateway/limits'
import { createCollabMetricsCollector } from '../observability/metrics'
import { createHocuspocusRuntime } from '../runtime/hocuspocus-adapter'
import { createEmptyDocumentYdocRuntimeStore } from '../runtime/ydoc-runtime-store'
import { registerCollabServerCloseHook } from './lifecycle'
import { createCollabFastifyLoggerOptions, redactCollabTicketFromUrl } from './logger'
import { resolveHeaderRequestId } from './request'
import { registerDocumentCollabWsRoute } from './routes/document-collab-ws'
import { registerHealthRoutes } from './routes/health'
import { registerInternalPermissionInvalidationRoutes } from './routes/internal-permission-invalidations'
import { registerMetricsRoutes } from './routes/metrics'

export interface CreateCollabServerInput {
  config: CollabConfig
  hocuspocus?: CollabHocuspocusRuntime
  ydocRuntimeStore?: DocumentYdocRuntimeStore
  currentProjectionClient?: DocumentYdocCurrentProjectionClient
  ticketClient: CollabTicketClient
  metrics?: CollabMetricsCollector
  pubSub?: CollabPubSub
  lifecycle?: CollabServerLifecycle
}

export function createCollabServer(input: CreateCollabServerInput): FastifyInstance {
  const ydocRuntimeStore = input.ydocRuntimeStore ?? createEmptyDocumentYdocRuntimeStore()
  const metrics = input.metrics ?? createCollabMetricsCollector()
  const connectionGate = createConnectionGate({
    maxConnections: input.config.maxConnections,
  })
  const handshakeRateLimiter = createFixedWindowRateLimiter({
    maxRequests: input.config.handshakeRateLimitMax,
    windowMs: input.config.handshakeRateLimitWindowMs,
  })
  const activeConnections = createCollabActiveConnectionRegistry()
  const unsubscribePubSub = input.pubSub?.subscribe(async (message) => {
    if (message.type !== 'permission-invalidation') {
      return
    }

    activeConnections.invalidate(message.invalidation)
  })
  const app = fastify({
    disableRequestLogging: request => request.url?.startsWith('/healthz') ?? false,
    genReqId: request => resolveHeaderRequestId(request.headers['x-request-id']) ?? randomUUID(),
    logger: createCollabFastifyLoggerOptions(input.config.logger),
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  })
  const hocuspocus = input.hocuspocus ?? createHocuspocusRuntime({
    ydocRuntimeStore,
    currentProjectionClient: input.currentProjectionClient,
    metrics,
    logger: app.log,
    onFatalPersistenceFailure(failure) {
      const result = activeConnections.disconnectDocument(failure)
      app.log.error({
        ...failure,
        disconnected: result.disconnected,
      }, 'Collab document connections closed after fatal persistence failure')
    },
    maxUpdateBytes: input.config.maxUpdateBytes,
  })

  app.register(websocket)
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })
  app.addHook('onReady', async () => {
    await input.pubSub?.ready?.()
  })

  registerHealthRoutes(app)
  registerMetricsRoutes(app, metrics)
  registerInternalPermissionInvalidationRoutes({
    app,
    activeConnections,
    appInternalKey: input.config.appInternalKey,
    pubSub: input.pubSub,
  })
  registerDocumentCollabWsRoute({
    app,
    hocuspocus,
    ydocRuntimeStore,
    ticketClient: input.ticketClient,
    metrics,
    activeConnections,
    connectionGate,
    handshakeRateLimiter,
    validateRuntimeEpoch: Boolean(input.ydocRuntimeStore),
  })
  registerCollabServerCloseHook({
    app,
    hocuspocus,
    ydocRuntimeStore,
    pubSub: input.pubSub,
    unsubscribePubSub,
    lifecycle: input.lifecycle,
  })

  return app
}

export { redactCollabTicketFromUrl }
