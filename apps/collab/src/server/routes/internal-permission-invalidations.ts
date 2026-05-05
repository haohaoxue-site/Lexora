import type { FastifyInstance } from 'fastify'
import type { CollabActiveConnectionRegistry } from '../../gateway/active-connections'
import type { CollabPubSub } from '../../integrations/pubsub'
import { COLLAB_PUBSUB_MESSAGE_TYPE, CollabPermissionInvalidationRequestSchema } from '@haohaoxue/samepage-contracts'

export interface RegisterInternalPermissionInvalidationRoutesInput {
  app: FastifyInstance
  activeConnections: CollabActiveConnectionRegistry
  pubSub?: CollabPubSub
}

export function registerInternalPermissionInvalidationRoutes(
  input: RegisterInternalPermissionInvalidationRoutesInput,
): void {
  input.app.post('/internal/collab/permission-invalidations', async (request, reply) => {
    const parsedBody = CollabPermissionInvalidationRequestSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.code(400).send({
        code: 'invalid-permission-invalidation',
      })
    }

    const result = input.activeConnections.invalidate(parsedBody.data)
    await input.pubSub?.publish({
      type: COLLAB_PUBSUB_MESSAGE_TYPE.PERMISSION_INVALIDATION,
      invalidation: parsedBody.data,
    })

    return result
  })
}
