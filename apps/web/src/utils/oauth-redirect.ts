import { OAUTH_REDIRECT_ERROR_CODE } from '@haohaoxue/samepage-contracts'

interface ResolveOAuthRedirectErrorMessageOptions {
  purpose: 'login' | 'bind'
  providerLabel?: string
  fallbackMessage?: string
}

export function resolveOAuthRedirectErrorMessage(
  errorCode: string | null | undefined,
  options: ResolveOAuthRedirectErrorMessageOptions,
): string {
  const normalizedErrorCode = errorCode?.trim()
  const fallbackMessage = options.fallbackMessage
    ?? (options.purpose === 'bind'
      ? `${options.providerLabel ?? '第三方账号'} 账号绑定失败`
      : '第三方登录失败，请稍后重试')

  if (!normalizedErrorCode) {
    return fallbackMessage
  }

  if (normalizedErrorCode === OAUTH_REDIRECT_ERROR_CODE.CALLBACK_FAILED) {
    if (options.purpose === 'bind') {
      return `${options.providerLabel ?? '第三方账号'} 账号绑定失败，请稍后重试`
    }

    return '第三方登录失败，请稍后重试'
  }

  return fallbackMessage
}
