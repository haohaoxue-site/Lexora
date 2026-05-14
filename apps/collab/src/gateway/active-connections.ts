import type { CollabErrorCode, CollabPermissionInvalidationRequest, CollabTicketPayload } from '@haohaoxue/samepage-contracts'
import { COLLAB_ERROR_CODE, COLLAB_PERMISSION_INVALIDATION_REASON } from '@haohaoxue/samepage-contracts'

const COLLAB_SOCKET_CLOSE_CODE = {
  PERMISSION_INVALIDATED: 4003,
  PERSISTENCE_FAILED: 4004,
} as const

/** 活跃协作连接注册表。 */
export interface CollabActiveConnectionRegistry {
  add: (input: AddCollabActiveConnectionInput) => () => void
  invalidate: (input: CollabPermissionInvalidationRequest) => CollabPermissionInvalidationResult
  disconnectDocument: (input: DisconnectCollabDocumentConnectionsInput) => CollabPermissionInvalidationResult
}

/** 注册活跃协作连接输入。 */
export interface AddCollabActiveConnectionInput {
  socket: unknown
  ticket: CollabTicketPayload
  releaseConnection: () => void
}

/** 权限失效处理结果。 */
export interface CollabPermissionInvalidationResult {
  disconnected: number
}

/** 断开文档协作连接输入。 */
export interface DisconnectCollabDocumentConnectionsInput {
  documentId: string
  code: CollabErrorCode
}

interface ActiveConnectionEntry {
  socket: unknown
  ticket: CollabTicketPayload
  release: () => void
}

export function createCollabActiveConnectionRegistry(): CollabActiveConnectionRegistry {
  const entries = new Set<ActiveConnectionEntry>()

  return {
    add(input) {
      let released = false
      const entry: ActiveConnectionEntry = {
        socket: input.socket,
        ticket: input.ticket,
        release() {
          if (released) {
            return
          }

          released = true
          entries.delete(entry)
          input.releaseConnection()
        },
      }

      entries.add(entry)

      return entry.release
    },
    invalidate(input) {
      let disconnected = 0

      for (const entry of Array.from(entries)) {
        if (!matchesCollabPermissionInvalidation(input, entry.ticket)) {
          continue
        }

        disconnected += 1
        entry.release()
        closeCollabSocket(entry.socket, {
          code: COLLAB_ERROR_CODE.PERMISSION_INVALIDATED,
          closeCode: COLLAB_SOCKET_CLOSE_CODE.PERMISSION_INVALIDATED,
        })
      }

      return {
        disconnected,
      }
    },
    disconnectDocument(input) {
      let disconnected = 0

      for (const entry of Array.from(entries)) {
        if (entry.ticket.documentId !== input.documentId) {
          continue
        }

        disconnected += 1
        entry.release()
        closeCollabSocket(entry.socket, {
          code: input.code,
          closeCode: COLLAB_SOCKET_CLOSE_CODE.PERSISTENCE_FAILED,
        })
      }

      return {
        disconnected,
      }
    },
  }
}

function closeCollabSocket(
  socket: unknown,
  input: {
    code: CollabErrorCode
    closeCode: number
  },
): void {
  const target = resolveSocketCloseTarget(socket)

  if (typeof target?.close === 'function') {
    target.close(input.closeCode, input.code)
    return
  }

  if (typeof target?.terminate === 'function') {
    target.terminate()
  }
}

function resolveSocketCloseTarget(socket: unknown): { close?: unknown, terminate?: unknown } | null {
  if (!socket || typeof socket !== 'object') {
    return null
  }

  if ('close' in socket || 'terminate' in socket) {
    return socket as { close?: unknown, terminate?: unknown }
  }

  if ('socket' in socket) {
    const nestedSocket = socket.socket

    if (nestedSocket && typeof nestedSocket === 'object') {
      return nestedSocket as { close?: unknown, terminate?: unknown }
    }
  }

  return null
}

function matchesCollabPermissionInvalidation(
  input: CollabPermissionInvalidationRequest,
  ticket: CollabTicketPayload,
): boolean {
  if (input.reason === COLLAB_PERMISSION_INVALIDATION_REASON.SHARE_REVOKED) {
    return false
  }

  if (input.documentId && input.documentId !== ticket.documentId) {
    return false
  }

  if (input.workspaceId && input.workspaceId !== ticket.workspaceId) {
    return false
  }

  if (input.userId && input.userId !== ticket.userId) {
    return false
  }

  if (input.runtimeEpoch !== undefined && input.runtimeEpoch !== ticket.runtimeEpoch) {
    return false
  }

  return true
}
