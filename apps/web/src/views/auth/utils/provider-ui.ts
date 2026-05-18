import type { AuthProviderName } from '@haohaoxue/samepage-contracts'
import { AUTH_PROVIDER } from '@haohaoxue/samepage-contracts'

/**
 * 认证平台展示信息。
 */
export interface AuthProviderUiMeta {
  title: string
  icon: string
}

export const AUTH_PROVIDER_UI_META: Record<AuthProviderName, AuthProviderUiMeta> = {
  [AUTH_PROVIDER.GOOGLE]: {
    title: 'Google',
    icon: 'brand-google',
  },
  [AUTH_PROVIDER.GITHUB]: {
    title: 'GitHub',
    icon: 'brand-github',
  },
  [AUTH_PROVIDER.LINUX_DO]: {
    title: 'LinuxDo',
    icon: 'brand-linux-do',
  },
}
