/** 协作票据重放缓存。 */
export interface CollabTicketReplayCache {
  consume: (input: ConsumeCollabTicketJtiInput) => boolean
}

/** 消费协作票据 jti 输入。 */
export interface ConsumeCollabTicketJtiInput {
  jti: string
  expiresAt: string
}

/** 内存重放缓存输入。 */
export interface CreateMemoryCollabTicketReplayCacheInput {
  now?: () => Date
}

export function createMemoryCollabTicketReplayCache(
  input: CreateMemoryCollabTicketReplayCacheInput = {},
): CollabTicketReplayCache {
  const consumedJtiExpiresAt = new Map<string, number>()
  const now = input.now ?? (() => new Date())

  return {
    consume(consumeInput) {
      const nowMs = now().getTime()
      pruneExpiredJti(consumedJtiExpiresAt, nowMs)

      if (consumedJtiExpiresAt.has(consumeInput.jti)) {
        return false
      }

      consumedJtiExpiresAt.set(consumeInput.jti, Date.parse(consumeInput.expiresAt))
      return true
    },
  }
}

function pruneExpiredJti(consumedJtiExpiresAt: Map<string, number>, nowMs: number): void {
  for (const [jti, expiresAtMs] of consumedJtiExpiresAt) {
    if (expiresAtMs <= nowMs) {
      consumedJtiExpiresAt.delete(jti)
    }
  }
}
