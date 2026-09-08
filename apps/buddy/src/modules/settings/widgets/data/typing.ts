import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { LocalRun, LocalRunEvent } from '@buddy-shared/runs/runApi'
import type { LocalBuddyServiceSupervisorState } from '@buddy-shared/runtime/serviceState'
import type { LocalUsageSnapshot } from '@buddy-shared/usage/usageApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface RunLogProps {
  language: BuddyLocale
  listRecentRuns: () => Promise<readonly LocalRun[]>
  listRunEvents: (runId: string) => Promise<readonly LocalRunEvent[]>
}

export interface DataSettingsProps extends RunLogProps {
  canRestartRuntime: boolean
  runtimeRestartError: string | null
  runtimeError: string | null
  runtimeState: LocalBuddyServiceSupervisorState
  selectedModel: LocalRuntimeModelOption | null
  usageError: string | null
  usageSnapshot: LocalUsageSnapshot | null
  restartRuntime: () => Promise<boolean>
}
