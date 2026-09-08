import { formatLocalChatPublicError } from '@buddy-shared/runtime/localChatError'

import { describe, expect, it } from 'vitest'
import { resolveLocalChatErrorMessage } from '../localChatError'

describe('desktopChatError', () => {
  it('maps stable provider errors without exposing diagnostics', () => {
    const secret = 'private-provider-diagnostic'
    const error = new Error(`${formatLocalChatPublicError({
      code: 'AUTHENTICATION_REQUIRED',
      retryable: true,
    })}:${secret}`)

    const message = resolveLocalChatErrorMessage(error, 'en-US')

    expect(message).toBe('Sign in to the provider first')
    expect(message).not.toContain(secret)
  })
})
