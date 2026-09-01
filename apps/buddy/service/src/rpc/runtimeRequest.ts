import type { z } from 'zod'
import type { RuntimeRequestHandler } from '../../../shared/runtimeRpcPeer'

export interface RuntimeRequestRegistrar {
  onRequest: (method: string, handler: RuntimeRequestHandler) => () => void
}

export interface RuntimeRpcRegistrar extends RuntimeRequestRegistrar {
  onNotification: (listener: (method: string, params: unknown) => void) => () => void
}

export type BuddyServiceErrorCode
  = | 'DIRECTORY_NOT_AUTHORIZED'
    | 'SPACE_UNAVAILABLE'
    | 'VALIDATION_FAILED'

export class BuddyServiceError extends Error {
  readonly code: BuddyServiceErrorCode

  constructor(code: BuddyServiceErrorCode) {
    super('Lexora Buddy runtime request failed')
    this.name = 'BuddyServiceError'
    this.code = code
  }
}

export function ok() {
  return { ok: true as const }
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return result.data
}
