import type { CollabPermissionInvalidationRequest } from '@haohaoxue/lexora-contracts'
import {
  COLLAB_PUBSUB_MESSAGE_TYPE,
  COLLAB_REDIS_CHANNEL,
  CollabPermissionInvalidationPubSubMessageSchema,
} from '@haohaoxue/lexora-contracts'
import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class CollabPermissionInvalidationPublisherService {
  private readonly logger = new Logger(CollabPermissionInvalidationPublisherService.name)

  constructor(private readonly redisService: RedisService) {}

  async publishPermissionInvalidations(inputs: CollabPermissionInvalidationRequest[]): Promise<void> {
    const invalidations = dedupeCollabPermissionInvalidations(inputs)

    if (invalidations.length === 0) {
      return
    }

    const redis = this.redisService.getClient()

    await Promise.all(invalidations.map(async (input) => {
      try {
        await redis.publish(COLLAB_REDIS_CHANNEL.PERMISSION_INVALIDATION, JSON.stringify(
          CollabPermissionInvalidationPubSubMessageSchema.parse({
            type: COLLAB_PUBSUB_MESSAGE_TYPE.PERMISSION_INVALIDATION,
            invalidation: input,
          }),
        ))
      }
      catch (error) {
        this.logger.warn(`collab 权限失效通知发送失败: ${formatRedisPublishError(error)} ${JSON.stringify(input)}`)
      }
    }))
  }
}

function formatRedisPublishError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function dedupeCollabPermissionInvalidations(
  inputs: CollabPermissionInvalidationRequest[],
): CollabPermissionInvalidationRequest[] {
  const seen = new Set<string>()
  const result: CollabPermissionInvalidationRequest[] = []

  for (const input of inputs) {
    const key = JSON.stringify({
      reason: input.reason,
      documentId: input.documentId ?? null,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      runtimeEpoch: input.runtimeEpoch ?? null,
    })

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(input)
  }

  return result
}
