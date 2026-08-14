import { Buffer } from 'node:buffer'
import { z } from 'zod'

interface MessagePageCursorScope {
  branchId: string
  conversationId: string
}

interface CreateMessagePageCursorInput extends MessagePageCursorScope {
  beforeMessageId: string
}

const cursorPayloadSchema = z.object({
  beforeMessageId: z.string().trim().min(1).max(256),
  branchId: z.string().trim().min(1).max(256),
  conversationId: z.string().trim().min(1).max(256),
  version: z.literal(1),
}).strict()

export function createMessagePageCursor(input: CreateMessagePageCursorInput): string {
  return Buffer.from(JSON.stringify({
    ...input,
    version: 1,
  })).toString('base64url')
}

export function parseMessagePageCursor(
  cursor: string,
  scope: MessagePageCursorScope,
): string {
  try {
    const payload = cursorPayloadSchema.parse(JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ))
    if (
      payload.branchId !== scope.branchId
      || payload.conversationId !== scope.conversationId
    ) {
      throw new MessagePageCursorError()
    }
    return payload.beforeMessageId
  }
  catch (error) {
    if (error instanceof MessagePageCursorError)
      throw error
    throw new MessagePageCursorError()
  }
}

export class MessagePageCursorError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy message page cursor is invalid')
    this.name = 'MessagePageCursorError'
  }
}
