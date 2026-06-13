import type { CollabTicketPayload } from '@haohaoxue/lexora-contracts'

/** 可安全记录的协作票据上下文。 */
export interface SafeCollabTicketLogContext {
  jti: string
  documentId: string
  userId: string
  workspaceId: string
  runtimeRole: CollabTicketPayload['runtimeRole']
  runtimeEpoch: number
}

export function toSafeCollabTicketLogContext(payload: CollabTicketPayload): SafeCollabTicketLogContext {
  return {
    jti: payload.jti,
    documentId: payload.documentId,
    userId: payload.userId,
    workspaceId: payload.workspaceId,
    runtimeRole: payload.runtimeRole,
    runtimeEpoch: payload.runtimeEpoch,
  }
}
