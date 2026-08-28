import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { AttentionNotificationService } from './AttentionNotificationService'
import { z } from 'zod'
import { parse } from '../rpc/runtimeRequest'

const emptySchema = z.object({}).strict()
const idSchema = z.string().trim().min(1).max(256)

export interface RegisterNotificationRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: Pick<
    AttentionNotificationService,
    'list' | 'markAllSeen' | 'markSeen'
  >
}

export function registerNotificationRpc(options: RegisterNotificationRpcOptions): () => void {
  const disposers = [
    options.rpc.onRequest('notifications.list', (params) => {
      parse(emptySchema, params)
      return options.service.list()
    }),
    options.rpc.onRequest('notifications.markSeen', (params) => {
      const input = parse(z.object({
        notificationId: idSchema,
        revision: z.string().min(1).max(512),
      }).strict(), params)
      return options.service.markSeen(input.notificationId, input.revision)
    }),
    options.rpc.onRequest('notifications.markAllSeen', (params) => {
      parse(emptySchema, params)
      return options.service.markAllSeen()
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
