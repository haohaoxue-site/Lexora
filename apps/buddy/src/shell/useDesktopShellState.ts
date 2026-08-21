import type {
  DesktopAppInfo,
  DesktopChatSidebarSectionOrder,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { DEFAULT_DESKTOP_CHAT_SIDEBAR_SECTION_ORDER } from '@buddy-electron/shared/desktopApi'
import { computed, readonly, shallowRef } from 'vue'

export function useDesktopShellState(settings: ApplicationSettingsStore) {
  const api = requireDesktopApi()
  const appInfo = shallowRef<DesktopAppInfo | null>(null)
  const appSidebarCollapsed = computed(() => settings.config.value?.desktop.sidebarCollapsed ?? false)
  const chatSidebarSectionOrder = computed(() =>
    settings.config.value?.desktop.chatSidebarSectionOrder
    ?? DEFAULT_DESKTOP_CHAT_SIDEBAR_SECTION_ORDER,
  )

  async function initialize() {
    appInfo.value = await api.app.getInfo().catch(() => null)
  }

  async function setChatSidebarSectionOrder(
    value: DesktopChatSidebarSectionOrder,
  ) {
    return settings.updateSettings({ desktop: { chatSidebarSectionOrder: value } })
  }

  async function setAppSidebarCollapsed(value: boolean) {
    if (appSidebarCollapsed.value === value)
      return true
    return settings.updateSettings({ desktop: { sidebarCollapsed: value } })
  }

  return {
    appInfo: readonly(appInfo),
    appSidebarCollapsed: readonly(appSidebarCollapsed),
    chatSidebarSectionOrder: readonly(chatSidebarSectionOrder),
    initialize,
    setAppSidebarCollapsed,
    setChatSidebarSectionOrder,
  }
}

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Desktop API is unavailable')
  return api
}
