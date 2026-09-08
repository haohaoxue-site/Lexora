import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'

import type { Ref } from 'vue'
import type { ApplicationSettings } from '@/modules/settings/contracts'
import type { UsageStore } from '@/modules/settings/state/useUsageStore'
import type { RuntimeSupervisorStore } from '@/platform/runtime/useRuntimeSupervisorStore'

interface CreateDesktopDataSettingsCapabilityInput {
  api: LexoraDesktopApi['localChat']
  applicationSettings: ApplicationSettings
  selectedModel: Readonly<Ref<LocalRuntimeModelOption | null>>
  runtimeSupervisor: RuntimeSupervisorStore
  usage: UsageStore
}

export function createDesktopDataSettingsCapability(
  input: CreateDesktopDataSettingsCapabilityInput,
) {
  return {
    ...input.usage,
    canRestartRuntime: input.runtimeSupervisor.canRestartRuntime,
    runtimeRestartError: input.runtimeSupervisor.restartError,
    language: input.applicationSettings.language,
    listRecentRuns: () => input.api.runs.list({ limit: 60 }),
    listRunEvents: (runId: string) => input.api.runs.listEvents({ limit: 300, runId }),
    restartRuntime: input.runtimeSupervisor.restartRuntime,
    runtimeError: input.runtimeSupervisor.runtimeError,
    runtimeState: input.runtimeSupervisor.runtimeState,
    selectedModel: input.selectedModel,
  }
}

export type DesktopDataSettingsCapability = ReturnType<
  typeof createDesktopDataSettingsCapability
>
