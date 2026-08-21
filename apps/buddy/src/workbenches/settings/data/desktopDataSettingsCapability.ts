import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeRecoveryStore } from '@/stores/useRuntimeRecoveryStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { UsageStore } from '@/stores/useUsageStore'

interface CreateDesktopDataSettingsCapabilityInput {
  api: LexoraDesktopApi['localChat']
  applicationSettings: ApplicationSettingsStore
  modelProviders: ModelProvidersStore
  runtimeRecovery: RuntimeRecoveryStore
  runtimeSupervisor: RuntimeSupervisorStore
  usage: UsageStore
}

export function createDesktopDataSettingsCapability(
  input: CreateDesktopDataSettingsCapabilityInput,
) {
  return {
    ...input.runtimeRecovery,
    ...input.usage,
    runtimeRestartError: input.runtimeSupervisor.restartError,
    language: input.applicationSettings.language,
    listRecentRuns: () => input.api.runs.list({ limit: 60 }),
    listRunEvents: (runId: string) => input.api.runs.listEvents({ limit: 300, runId }),
    restartRuntime: input.runtimeSupervisor.restartRuntime,
    runtimeError: input.runtimeSupervisor.runtimeError,
    runtimeState: input.runtimeSupervisor.runtimeState,
    selectedModel: input.modelProviders.selectedModel,
  }
}

export type DesktopDataSettingsCapability = ReturnType<
  typeof createDesktopDataSettingsCapability
>
