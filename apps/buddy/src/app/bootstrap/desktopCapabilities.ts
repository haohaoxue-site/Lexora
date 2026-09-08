import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { DesktopStores } from '@/app/bootstrap/useDesktopAppState'
import type { AutomationCapability } from '@/modules/automations'
import type { DesktopDataSettingsCapability, DesktopLocalSettingsCapability, WebSettingsCapability } from '@/modules/settings'
import type { TaskCapability } from '@/modules/tasks'
import { useAutomationCapability } from '@/modules/automations'
import { createDesktopDataSettingsCapability, createDesktopLocalSettingsCapability, useWebSettingsCapability } from '@/modules/settings'

export interface DesktopCapabilities {
  automations: AutomationCapability
  dataSettings: DesktopDataSettingsCapability
  localSettings: DesktopLocalSettingsCapability
  webSettings: WebSettingsCapability
}

interface CreateDesktopCapabilitiesInput {
  api: LexoraDesktopApi
  stores: DesktopStores
  tasks: TaskCapability
  onAutomationRunFailure: (message: string) => void
}

export function createDesktopCapabilities(
  input: CreateDesktopCapabilitiesInput,
): DesktopCapabilities {
  const { stores } = input
  return {
    automations: useAutomationCapability({
      api: input.api.localChat,
      language: stores.applicationSettings.language,
      onRunFailure: input.onAutomationRunFailure,
    }),
    dataSettings: createDesktopDataSettingsCapability({
      api: input.api.localChat,
      applicationSettings: stores.applicationSettings,
      selectedModel: input.tasks.workspace.composer.selectedModel,
      runtimeSupervisor: stores.runtimeSupervisor,
      usage: stores.usage,
    }),
    localSettings: createDesktopLocalSettingsCapability(
      stores.localCapabilities,
      input.tasks.session.spaceId,
    ),
    webSettings: useWebSettingsCapability({ api: input.api.localChat.web, language: stores.applicationSettings.language }),
  }
}
