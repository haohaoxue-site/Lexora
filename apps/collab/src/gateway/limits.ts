import { COLLAB_ERROR_CODE } from '@haohaoxue/lexora-contracts'

/** 固定窗口限流器。 */
export interface FixedWindowRateLimiter {
  consume: (key: string) => boolean
}

/** 固定窗口限流器输入。 */
export interface CreateFixedWindowRateLimiterInput {
  maxRequests: number
  windowMs: number
  now?: () => number
}

/** 连接门闩。 */
export interface ConnectionGate {
  enter: () => ConnectionGateResult
}

/** 连接门闩结果。 */
export interface ConnectionGateResult {
  accepted: boolean
  release: () => void
}

/** 连接门闩输入。 */
export interface CreateConnectionGateInput {
  maxConnections: number
}

/** update 大小断言输入。 */
export interface AssertCollabUpdateSizeInput {
  update: Uint8Array
  maxUpdateBytes: number
}

export function createFixedWindowRateLimiter(input: CreateFixedWindowRateLimiterInput): FixedWindowRateLimiter {
  const windows = new Map<string, { count: number, resetAt: number }>()
  const now = input.now ?? (() => Date.now())

  return {
    consume(key) {
      const nowMs = now()
      const window = windows.get(key)

      if (!window || window.resetAt <= nowMs) {
        windows.set(key, {
          count: 1,
          resetAt: nowMs + input.windowMs,
        })

        return true
      }

      if (window.count >= input.maxRequests) {
        return false
      }

      window.count += 1
      return true
    },
  }
}

export function createConnectionGate(input: CreateConnectionGateInput): ConnectionGate {
  let activeConnections = 0

  return {
    enter() {
      if (activeConnections >= input.maxConnections) {
        return {
          accepted: false,
          release() {},
        }
      }

      activeConnections += 1
      let released = false

      return {
        accepted: true,
        release() {
          if (released) {
            return
          }

          released = true
          activeConnections = Math.max(0, activeConnections - 1)
        },
      }
    },
  }
}

export function assertCollabUpdateSize(input: AssertCollabUpdateSizeInput): void {
  if (input.update.byteLength > input.maxUpdateBytes) {
    throw new Error(COLLAB_ERROR_CODE.UPDATE_TOO_LARGE)
  }
}
