import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalRun } from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { ChatIndexData } from '@/workbenches/chat/state/useChatIndexData'
import type { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import { useChatBranchMutations } from '@/workbenches/chat/state/useChatBranchMutations'
import { useChatTurnExecution } from '@/workbenches/chat/state/useChatTurnExecution'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatExecutionOptions {
  activeRun: ValueRef<LocalRun | null>
  api: LexoraDesktopApi['localChat']
  chatIndexData: ChatIndexData
  session: ChatSession
  drafts: ReturnType<typeof useChatDrafts>
  draftScopeKey: ValueRef<string>
  executionProfile: ValueRef<BuddyExecutionProfile>
  getRunTerminationMessage: (errorCode: string | null) => string
  isUpdatingExecutionProfile: ValueRef<boolean>
  language: ValueRef<BuddyLocale>
  modelProviders: ModelProvidersStore
  persistWorkspaceState: () => Promise<boolean>
  refreshBranches: () => Promise<void>
  runSync: ReturnType<typeof useChatRunSync>
  runtimeSupervisor: RuntimeSupervisorStore
  setErrorMessage: (message: string | null) => void
  unavailableCommandMessage: () => string
}

export function useChatExecution(options: UseChatExecutionOptions) {
  const turnExecution = useChatTurnExecution({
    activeRun: options.activeRun,
    api: options.api,
    chatIndexData: options.chatIndexData,
    session: options.session,
    drafts: options.drafts,
    draftScopeKey: options.draftScopeKey,
    executionProfile: options.executionProfile,
    getRunTerminationMessage: options.getRunTerminationMessage,
    isUpdatingExecutionProfile: options.isUpdatingExecutionProfile,
    language: options.language,
    modelProviders: options.modelProviders,
    persistWorkspaceState: options.persistWorkspaceState,
    runSync: options.runSync,
    runtimeSupervisor: options.runtimeSupervisor,
    setErrorMessage: options.setErrorMessage,
    unavailableCommandMessage: options.unavailableCommandMessage,
  })
  const branchMutations = useChatBranchMutations({
    activeRun: options.activeRun,
    api: options.api,
    chatIndexData: options.chatIndexData,
    session: options.session,
    isSending: turnExecution.isSending,
    isUpdatingExecutionProfile: options.isUpdatingExecutionProfile,
    language: options.language,
    modelProviders: options.modelProviders,
    refreshBranches: options.refreshBranches,
    runSync: options.runSync,
    runtimeSupervisor: options.runtimeSupervisor,
    setErrorMessage: options.setErrorMessage,
  })

  return {
    ...branchMutations,
    ...turnExecution,
  }
}
