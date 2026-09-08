import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { AttentionNotificationService } from './AttentionNotificationService'
import { notificationsRpc } from '../../../shared/notifications/notificationApi'
import { registerRuntimeRequest } from '../rpc/runtimeRequest'

export interface RegisterNotificationRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: Pick<
    AttentionNotificationService,
    'list' | 'markAllSeen' | 'markSeen'
  >
}

export function registerNotificationRpc(options: RegisterNotificationRpcOptions): () => void {
  const disposers = [
    registerRuntimeRequest(options.rpc, notificationsRpc.list, () => {
      return options.service.list()
    }),
    registerRuntimeRequest(options.rpc, notificationsRpc.markSeen, (input) => {
      return options.service.markSeen(input.notificationId, input.revision)
    }),
    registerRuntimeRequest(options.rpc, notificationsRpc.markAllSeen, () => {
      return options.service.markAllSeen()
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
