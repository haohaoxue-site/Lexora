import { formatLocalChatPublicError } from '@buddy-shared/runtime/localChatError'

import { describe, expect, it } from 'vitest'
import { resolveLocalChatErrorMessage } from '../localChatError'

describe('desktopChatError', () => {
  it.each([
    ['CREDENTIAL_STORE_UNAVAILABLE', '系统凭据加密服务不可用'],
    ['CREDENTIAL_STORE_FAILURE', '系统凭据读取或保存失败'],
  ] as const)('explains %s after the Electron error boundary', (code, message) => {
    const error = new Error(`Error invoking remote method 'lexora:buddy:providers:login': Error: ${formatLocalChatPublicError({
      code,
      retryable: false,
    })}`)

    expect(resolveLocalChatErrorMessage(error, 'zh-CN')).toBe(message)
  })

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
