import type { AuthCapabilities } from '@/apis/capabilities'
import { AUTH_PROVIDER } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { shallowRef } from 'vue'
import { getAuthCapabilities } from '@/apis/capabilities'

export const DEFAULT_AUTH_CAPABILITIES: AuthCapabilities = {
  emailBindingEnabled: false,
  passwordRegistrationEnabled: false,
  passwordRegistrationInviteCodeRequired: false,
  providers: {
    [AUTH_PROVIDER.GITHUB]: {
      enabled: false,
      allowRegistration: false,
      inviteCodeRequired: false,
    },
    [AUTH_PROVIDER.LINUX_DO]: {
      enabled: false,
      allowRegistration: false,
      inviteCodeRequired: false,
    },
  },
}

export const useSettingsAuthCapabilities = createSharedComposable(() => {
  const authCapabilities = shallowRef<AuthCapabilities>(DEFAULT_AUTH_CAPABILITIES)

  async function loadAuthCapabilities() {
    authCapabilities.value = DEFAULT_AUTH_CAPABILITIES
    const next = await getAuthCapabilities().catch(() => null)
    authCapabilities.value = next ?? DEFAULT_AUTH_CAPABILITIES
  }

  return {
    authCapabilities,
    loadAuthCapabilities,
  }
})
