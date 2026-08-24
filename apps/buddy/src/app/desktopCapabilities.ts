import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { DesktopStores } from '@/app/useDesktopAppState'
import type { AutomationCapability } from '@/workbenches/automations/useAutomationCapability'
import type { ChatCapability } from '@/workbenches/chat/state/useChatCapability'
import type { DesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import type { DesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'
import { useAutomationCapability } from '@/workbenches/automations/useAutomationCapability'
import { createDesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import { createDesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'

export interface DesktopCapabilities {
  applicationSettings: DesktopStores['applicationSettings']
  automations: AutomationCapability
  chat: ChatCapability
  dataSettings: DesktopDataSettingsCapability
  localSettings: DesktopLocalSettingsCapability
  notifications: DesktopStores['notifications']
  providerSettings: DesktopStores['modelProviders']
}

interface CreateDesktopCapabilitiesInput {
  api: LexoraDesktopApi
  chat: ChatCapability
  stores: DesktopStores
}

export function createDesktopCapabilities(
  input: CreateDesktopCapabilitiesInput,
): DesktopCapabilities {
  const { stores } = input
  return {
    applicationSettings: stores.applicationSettings,
    automations: useAutomationCapability({
      api: input.api.localChat,
      language: stores.applicationSettings.language,
    }),
    chat: input.chat,
    dataSettings: createDesktopDataSettingsCapability({
      api: input.api.localChat,
      applicationSettings: stores.applicationSettings,
      modelProviders: stores.modelProviders,
      runtimeRecovery: stores.runtimeRecovery,
      runtimeSupervisor: stores.runtimeSupervisor,
      usage: stores.usage,
    }),
    localSettings: createDesktopLocalSettingsCapability(
      stores.localCapabilities,
      input.chat.session.projectId,
    ),
    notifications: stores.notifications,
    providerSettings: stores.modelProviders,
  }
}
