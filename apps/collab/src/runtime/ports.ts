import type { Hocuspocus } from '@hocuspocus/server'
import type { DocumentYdocCurrentProjectionClient } from '../clients/documents'
import type { CollabMetricsCollector } from '../observability/metrics'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'

/** Hocuspocus 连接上下文。 */
export interface CollabHocuspocusContext {
  documentId: string
  canWrite: boolean
  userId?: string
  workspaceId?: string
  runtimeEpoch?: number
  ticketJti?: string
}

/** 协作 WebSocket runtime。 */
export interface CollabHocuspocusRuntime {
  handleConnection: Hocuspocus['handleConnection']
  closeConnections: Hocuspocus['closeConnections']
  flushPersistenceQueues?: () => Promise<void>
}

/** 创建 Hocuspocus runtime 输入。 */
export interface CreateHocuspocusRuntimeInput {
  ydocRuntimeStore?: DocumentYdocRuntimeStore
  currentProjectionClient?: DocumentYdocCurrentProjectionClient
  metrics?: CollabMetricsCollector
  maxUpdateBytes?: number
}
