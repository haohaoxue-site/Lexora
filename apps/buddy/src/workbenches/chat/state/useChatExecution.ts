import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalRun } from '@buddy-electron/shared/localChatApi'
import type { BuddyApprovalPolicy } from '@buddy-shared/approvalPolicy'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import type { RuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { useChatRunSync } from '@/workbenches/chat/state/useChatRunSync'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import type { TaskIndexData } from '@/workbenches/tasks/state/useTaskIndexData'
import { useChatBranchMutations } from '@/workbenches/chat/state/useChatBranchMutations'
import { useChatTurnExecution } from '@/workbenches/chat/state/useChatTurnExecution'

interface ValueRef<T> {
  readonly value: T
}

interface UseChatExecutionOptions {
  activeRun: ValueRef<LocalRun | null>
  approvalPolicy: ValueRef<BuddyApprovalPolicy>
  api: LexoraDesktopApi['localChat']
  taskIndexData: TaskIndexData
  session: ChatSession
  drafts: ReturnType<typeof useChatDrafts>
  draftScopeKey: ValueRef<string>
  executionProfile: ValueRef<BuddyExecutionProfile>
  getRunTerminationMessage: (errorCode: string | null) => string
  isUpdatingPermissionSettings: ValueRef<boolean>
  language: ValueRef<BuddyLocale>
  modelProviders: ModelProvidersStore
  onActionCommandRunStarted: (runId: string) => void
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
    approvalPolicy: options.approvalPolicy,
    api: options.api,
    taskIndexData: options.taskIndexData,
    session: options.session,
    drafts: options.drafts,
    draftScopeKey: options.draftScopeKey,
    executionProfile: options.executionProfile,
    getRunTerminationMessage: options.getRunTerminationMessage,
    isUpdatingPermissionSettings: options.isUpdatingPermissionSettings,
    language: options.language,
    modelProviders: options.modelProviders,
    onActionCommandRunStarted: options.onActionCommandRunStarted,
    persistWorkspaceState: options.persistWorkspaceState,
    runSync: options.runSync,
    runtimeSupervisor: options.runtimeSupervisor,
    setErrorMessage: options.setErrorMessage,
    unavailableCommandMessage: options.unavailableCommandMessage,
  })
  const branchMutations = useChatBranchMutations({
    activeRun: options.activeRun,
    api: options.api,
    taskIndexData: options.taskIndexData,
    session: options.session,
    isSending: turnExecution.isSending,
    isUpdatingPermissionSettings: options.isUpdatingPermissionSettings,
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
