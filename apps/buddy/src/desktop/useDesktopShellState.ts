import type {
  DesktopAppInfo,
  DesktopChatSidebarSection,
  LexoraDesktopApi,
} from '../../electron/shared/desktopApi'
import { readonly, shallowRef } from 'vue'

export function useDesktopShellState() {
  const api = requireDesktopApi()
  const appInfo = shallowRef<DesktopAppInfo | null>(null)
  const appSidebarCollapsed = shallowRef(false)
  const chatSidebarSectionOrder = shallowRef<[DesktopChatSidebarSection, DesktopChatSidebarSection]>([
    'recent',
    'projects',
  ])

  async function initialize() {
    const [appInfoResult, configResult] = await Promise.allSettled([
      api.app.getInfo(),
      api.settings.get(),
    ])
    if (appInfoResult.status === 'fulfilled')
      appInfo.value = appInfoResult.value
    if (configResult.status === 'fulfilled') {
      appSidebarCollapsed.value = configResult.value.desktop.sidebarCollapsed
      chatSidebarSectionOrder.value = configResult.value.desktop.chatSidebarSectionOrder
    }
  }

  async function setChatSidebarSectionOrder(
    value: [DesktopChatSidebarSection, DesktopChatSidebarSection],
  ) {
    const previous = chatSidebarSectionOrder.value
    chatSidebarSectionOrder.value = value
    try {
      const config = await api.settings.update({ desktop: { chatSidebarSectionOrder: value } })
      chatSidebarSectionOrder.value = config.desktop.chatSidebarSectionOrder
      return true
    }
    catch (error) {
      chatSidebarSectionOrder.value = previous
      console.error('Lexora Desktop chat sidebar settings are unavailable', error)
      return false
    }
  }

  async function setAppSidebarCollapsed(value: boolean) {
    if (appSidebarCollapsed.value === value)
      return true
    const previous = appSidebarCollapsed.value
    appSidebarCollapsed.value = value
    try {
      const config = await api.settings.update({ desktop: { sidebarCollapsed: value } })
      appSidebarCollapsed.value = config.desktop.sidebarCollapsed
      return true
    }
    catch (error) {
      appSidebarCollapsed.value = previous
      console.error('Lexora Desktop shell settings are unavailable', error)
      return false
    }
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
