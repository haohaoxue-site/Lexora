import type { CollabTicketPayload } from '@haohaoxue/samepage-contracts'
import type { FastifyInstance } from 'fastify'
import type { CollabActiveConnectionRegistry } from '../../gateway/active-connections'
import type { ConnectionGate, FixedWindowRateLimiter } from '../../gateway/limits'
import type { CollabTicketClient } from '../../integrations/collab-ticket-client'
import type { CollabMetricsCollector } from '../../observability/metrics'
import type { CollabHocuspocusRuntime } from '../../runtime/ports'
import type { DocumentYdocRuntimeStore } from '../../runtime/ydoc-runtime-store'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'
import { toSafeCollabTicketLogContext } from '../../gateway/ticket-log-context'
import { CollabTicketClientError } from '../../integrations/collab-ticket-client'
import {
  createHocuspocusWebRequest,
  getTicketFromRequest,
  isSameOriginRequest,
  registerSocketCloseRelease,
  resolveHandshakeRateLimitKey,
  resolveRequestId,
} from '../request'

const COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE = 'Collab WebSocket handshake rejected'

export interface RegisterDocumentCollabWsRouteInput {
  app: FastifyInstance
  hocuspocus: CollabHocuspocusRuntime
  ydocRuntimeStore: DocumentYdocRuntimeStore
  ticketClient: CollabTicketClient
  metrics: CollabMetricsCollector
  activeConnections: CollabActiveConnectionRegistry
  connectionGate: ConnectionGate
  handshakeRateLimiter: FixedWindowRateLimiter
  validateRuntimeEpoch: boolean
}

export function registerDocumentCollabWsRoute(input: RegisterDocumentCollabWsRouteInput): void {
  const authenticatedTickets = new WeakMap<object, CollabTicketPayload>()
  const connectionIds = new WeakMap<object, string>()
  const connectionReleases = new WeakMap<object, () => void>()
  const requestIds = new WeakMap<object, string>()

  input.app.register(async (instance) => {
    instance.get<{ Params: { documentId: string } }>('/collab/:documentId', {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!isSameOriginRequest(request)) {
          request.log.warn({
            code: 'origin-not-allowed',
            documentId: request.params.documentId,
          }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

          return reply.code(403).send({
            code: 'origin-not-allowed',
          })
        }

        if (!input.handshakeRateLimiter.consume(resolveHandshakeRateLimitKey(request))) {
          request.log.warn({
            code: COLLAB_ERROR_CODE.RATE_LIMITED,
            documentId: request.params.documentId,
          }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

          return reply.code(429).send({
            code: COLLAB_ERROR_CODE.RATE_LIMITED,
          })
        }

        const token = getTicketFromRequest(request.headers.authorization, request.url)

        if (!token) {
          request.log.warn({
            code: 'ticket-missing',
            documentId: request.params.documentId,
          }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

          return reply.code(401).send({
            code: 'ticket-missing',
          })
        }

        const connectionGateResult = input.connectionGate.enter()

        if (!connectionGateResult.accepted) {
          request.log.warn({
            code: COLLAB_ERROR_CODE.CONNECTION_LIMIT_EXCEEDED,
            documentId: request.params.documentId,
          }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

          return reply.code(503).send({
            code: COLLAB_ERROR_CODE.CONNECTION_LIMIT_EXCEEDED,
          })
        }

        connectionReleases.set(request.raw, connectionGateResult.release)

        try {
          const ticketPayload = await input.ticketClient.consumeDocumentCollabTicket(
            request.params.documentId,
            token,
          )
          if (input.validateRuntimeEpoch) {
            const currentRuntimeEpoch = await input.ydocRuntimeStore.loadDocumentRuntimeEpoch(ticketPayload.documentId)

            if (currentRuntimeEpoch !== ticketPayload.runtimeEpoch) {
              request.log.warn({
                code: COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED,
                ticket: toSafeCollabTicketLogContext(ticketPayload),
              }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

              releaseConnection(connectionReleases, request.raw)
              return reply.code(401).send({
                code: COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED,
              })
            }
          }

          connectionIds.set(request.raw, randomUUID())
          requestIds.set(request.raw, resolveRequestId(request))
          authenticatedTickets.set(request.raw, ticketPayload)
        }
        catch (error) {
          const code = error instanceof CollabTicketClientError ? error.code : null

          if (code) {
            request.log.warn({
              code,
              documentId: request.params.documentId,
            }, COLLAB_HANDSHAKE_REJECTED_LOG_MESSAGE)

            releaseConnection(connectionReleases, request.raw)
            return reply.code(401).send({
              code,
            })
          }

          releaseConnection(connectionReleases, request.raw)
          throw error
        }
      },
    }, (socket, request) => {
      const ticketPayload = authenticatedTickets.get(request.raw)
      const connectionId = connectionIds.get(request.raw)
      const requestId = requestIds.get(request.raw)
      const releaseConnectionRef = connectionReleases.get(request.raw)
      authenticatedTickets.delete(request.raw)
      connectionIds.delete(request.raw)
      connectionReleases.delete(request.raw)
      requestIds.delete(request.raw)

      if (releaseConnectionRef && ticketPayload && connectionId) {
        input.metrics.recordConnectionOpened({
          requestId,
          connectionId,
          documentId: ticketPayload.documentId,
        })
        const releaseActiveConnection = input.activeConnections.add({
          socket,
          ticket: ticketPayload,
          releaseConnection() {
            releaseConnectionRef()
            input.metrics.recordConnectionClosed({
              requestId,
              connectionId,
              documentId: ticketPayload.documentId,
            })
          },
        })

        registerSocketCloseRelease(socket, releaseActiveConnection)
      }
      else {
        releaseConnectionRef?.()
      }

      const hocuspocusConnection = input.hocuspocus.handleConnection(socket, createHocuspocusWebRequest(request), {
        documentId: request.params.documentId,
        userId: ticketPayload?.userId,
        workspaceId: ticketPayload?.workspaceId,
        canWrite: ticketPayload?.canWrite ?? false,
        runtimeEpoch: ticketPayload?.runtimeEpoch,
        ticketJti: ticketPayload?.jti,
      })
      socket.on('message', (message: unknown) => {
        hocuspocusConnection.handleMessage(toHocuspocusMessage(message))
      })
      socket.on('close', (code: number, reason: Buffer) => {
        hocuspocusConnection.handleClose({
          code,
          reason: reason.toString(),
        })
      })
      socket.on('error', () => {
        hocuspocusConnection.handleClose()
      })
    })
  })
}

function toHocuspocusMessage(message: unknown): Uint8Array {
  if (message instanceof Uint8Array) {
    return message
  }

  if (message instanceof ArrayBuffer) {
    return new Uint8Array(message)
  }

  if (Array.isArray(message)) {
    return Buffer.concat(message.map(fragment => toHocuspocusMessage(fragment)))
  }

  if (typeof message === 'string') {
    return new TextEncoder().encode(message)
  }

  return new Uint8Array()
}

function releaseConnection(
  connectionReleases: WeakMap<object, () => void>,
  raw: object,
): void {
  connectionReleases.get(raw)?.()
  connectionReleases.delete(raw)
}
