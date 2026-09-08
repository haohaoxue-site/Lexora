import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunEvent, LocalRunOutput } from '@buddy-shared/runs/runApi'
import type { Ref } from 'vue'

export interface UseTaskContextPanelOptions {
  activeConversationId: Readonly<Ref<string | null>>
  activeRunId: Readonly<Ref<string | null>>
  changeSets: Readonly<Ref<ReadonlyArray<LocalChangeSetSummary>>>
  runSignalEvents: Readonly<Ref<ReadonlyArray<LocalRunEvent>>>
  runOutputs: Readonly<Ref<ReadonlyArray<LocalRunOutput>>>
}
