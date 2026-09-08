import type { UseChatTurnExecutionOptions } from './useChatTurnExecution'
import type { UseChatBranchMutationsOptions } from '@/modules/tasks/state/conversations/useChatBranchMutations'
import { useChatBranchMutations } from '@/modules/tasks/state/conversations/useChatBranchMutations'
import { useChatTurnExecution } from './useChatTurnExecution'

type UseChatExecutionOptions = UseChatTurnExecutionOptions & Omit<UseChatBranchMutationsOptions, 'isSending'>

export function useChatExecution(options: UseChatExecutionOptions) {
  const turnExecution = useChatTurnExecution({
    activeRun: options.activeRun,
    approvalPolicy: options.approvalPolicy,
    api: options.api,
    canSendDraft: options.canSendDraft,
    taskIndexData: options.taskIndexData,
    session: options.session,
    drafts: options.drafts,
    draftScopeKey: options.draftScopeKey,
    draftChangedMessage: options.draftChangedMessage,
    executionProfile: options.executionProfile,
    getRunTerminationMessage: options.getRunTerminationMessage,
    isUpdatingPermissionSettings: options.isUpdatingPermissionSettings,
    language: options.language,
    modelSelection: options.modelSelection,
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
    canSendDraft: options.canSendDraft,
    drafts: options.drafts,
    taskIndexData: options.taskIndexData,
    session: options.session,
    isSending: turnExecution.isSending,
    isUpdatingPermissionSettings: options.isUpdatingPermissionSettings,
    language: options.language,
    modelSelection: options.modelSelection,
    refreshBranches: options.refreshBranches,
    persistWorkspaceState: options.persistWorkspaceState,
    selectComposerSource: options.selectComposerSource,
    runSync: options.runSync,
    runtimeSupervisor: options.runtimeSupervisor,
    setErrorMessage: options.setErrorMessage,
  })

  return {
    ...branchMutations,
    ...turnExecution,
  }
}
