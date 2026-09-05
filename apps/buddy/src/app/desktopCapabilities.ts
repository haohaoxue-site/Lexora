import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { DesktopStores } from '@/app/useDesktopAppState'
import type { AutomationCapability } from '@/workbenches/automations/useAutomationCapability'
import type { DesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import type { DesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'
import type { TaskCapability } from '@/workbenches/tasks/state/useTaskCapability'
import { useAutomationCapability } from '@/workbenches/automations/useAutomationCapability'
import { createDesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import { createDesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'
import { useWebSettingsCapability } from '@/workbenches/settings/web/useWebSettingsCapability'

export interface DesktopCapabilities {
  applicationSettings: DesktopStores['applicationSettings']
  automations: AutomationCapability
  dataSettings: DesktopDataSettingsCapability
  localSettings: DesktopLocalSettingsCapability
  notifications: DesktopStores['notifications']
  providerSettings: DesktopStores['modelProviders']
  tasks: TaskCapability
  webSettings: ReturnType<typeof useWebSettingsCapability>
}

interface CreateDesktopCapabilitiesInput {
  api: LexoraDesktopApi
  stores: DesktopStores
  tasks: TaskCapability
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
      input.tasks.session.spaceId,
    ),
    notifications: stores.notifications,
    providerSettings: stores.modelProviders,
    tasks: input.tasks,
    webSettings: useWebSettingsCapability({ api: input.api.localChat.web, language: stores.applicationSettings.language }),
  }
}
