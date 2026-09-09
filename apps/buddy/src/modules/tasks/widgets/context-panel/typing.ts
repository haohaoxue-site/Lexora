import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunEvent, LocalRunOutput } from '@buddy-shared/runs/runApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { Ref } from 'vue'

export interface UseTaskContextPanelOptions {
  activeSpace?: Readonly<Ref<LocalSpace | null>>
  activeConversationId: Readonly<Ref<string | null>>
  activeRunId: Readonly<Ref<string | null>>
  changeSets: Readonly<Ref<ReadonlyArray<LocalChangeSetSummary>>>
  runSignalEvents: Readonly<Ref<ReadonlyArray<LocalRunEvent>>>
  runOutputs: Readonly<Ref<ReadonlyArray<LocalRunOutput>>>
}
