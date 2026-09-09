import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { TaskChatWorkspace, TaskComposer, TaskDraftRestoration, TaskExecution, TaskStatus } from '../../contracts'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopSettingsCategory } from '@/shared/navigation/desktopRoutes'

export interface ChatWorkspaceProps {
  viewMode?: 'chat' | 'canvas'
  activeSearchMessageId: string | null
  matchingSearchMessageIds: readonly string[]
  workspace: TaskChatWorkspace
}

export interface ChatWorkspaceEmits {
  showCanvas: []
  openNodeArtifact: [artifact: LocalArtifact]
  openNodeChanges: [changes: LocalChangeSetSummary]
  openArtifact: [artifactId: string]
  openChanges: [changeSetId: string]
  openSettings: [category: DesktopSettingsCategory]
}

export interface TaskComposerHostProps {
  composer: TaskComposer
  execution: Pick<TaskExecution, 'activeRun' | 'canSend' | 'editingMessageId' | 'isMutatingBranch' | 'isSending' | 'cancelActiveRun' | 'send' | 'submitEditedMessage'>
  language: BuddyLocale
}

export interface TaskNoticesProps {
  execution: Pick<TaskExecution, 'approvalViews' | 'editingMessageId' | 'resolvingApprovalActions' | 'cancelEditUserMessage' | 'resolveApproval'>
  language: BuddyLocale
  restoration: TaskDraftRestoration
  status: TaskStatus
}
