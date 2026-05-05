import type { FastifyInstance } from 'fastify'
import type { CollabPubSub } from '../integrations/pubsub'
import type { CollabHocuspocusRuntime } from '../runtime/ports'
import type { DocumentYdocRuntimeStore } from '../runtime/ydoc-runtime-store'

/** 协作服务生命周期钩子。 */
export interface CollabServerLifecycle {
  flushBeforeClose?: () => Promise<void>
}

/** 注册协作服务关闭流程输入。 */
export interface RegisterCollabServerCloseHookInput {
  app: FastifyInstance
  hocuspocus: CollabHocuspocusRuntime
  ydocRuntimeStore: DocumentYdocRuntimeStore
  pubSub?: CollabPubSub
  unsubscribePubSub?: () => void
  lifecycle?: CollabServerLifecycle
}

export function registerCollabServerCloseHook(input: RegisterCollabServerCloseHookInput): void {
  input.app.addHook('onClose', async () => {
    input.unsubscribePubSub?.()
    await input.hocuspocus.flushPersistenceQueues?.()
    input.hocuspocus.closeConnections()
    await input.hocuspocus.flushPersistenceQueues?.()
    await input.lifecycle?.flushBeforeClose?.()
    await input.ydocRuntimeStore.close?.()
    await input.pubSub?.close?.()
  })
}
