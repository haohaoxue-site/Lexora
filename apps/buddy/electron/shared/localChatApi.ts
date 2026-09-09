import type { LocalArtifactText } from '../../shared/artifacts/artifactApi'
import type { LocalAutomation, LocalAutomationCreateRequest, LocalAutomationListRequest, LocalAutomationMutationRequest, LocalAutomationOccurrenceListRequest, LocalAutomationOccurrencePage, LocalAutomationPage, LocalAutomationPreviewRequest, LocalAutomationPreviewResult, LocalAutomationRunNowResult, LocalAutomationUpdateRequest } from '../../shared/automation/automationApi'
import type { LocalChangeSetDetail } from '../../shared/changes/changeApi'
import type { LocalConnector, LocalConnectorConfig, LocalConnectorCredential, LocalConnectorCredentialMutation } from '../../shared/connectors/connectorApi'
import type { LocalChatCommandRequest, LocalStartTurnRequest, LocalTurnStart } from '../../shared/conversation/chatApi'
import type { LocalComposerDraft, LocalComposerDraftOpen, LocalComposerDraftSave } from '../../shared/conversation/composerApi'
import type {
  BuddyComposerResource,
  BuddyComposerResourceAccept,
  BuddyComposerResourceComplete,
  BuddyComposerResourceTarget,
  BuddyComposerSourceList,
  BuddyComposerSourceListResponse,
  BuddyComposerSourceSelect,
  BuddyComposerSpaceFileSelect,
} from '../../shared/conversation/composerResource'
import type { LocalContextUsageSnapshot, LocalContextUsageSnapshotRequest } from '../../shared/conversation/contextApi'
import type { LocalConversation, LocalConversationBranch, LocalConversationSummary, LocalConversationTimelinePage, LocalMessagePage } from '../../shared/conversation/conversationApi'
import type { ConversationNodeDetailRequest, LocalConversationTree } from '../../shared/conversation/conversationTree'
import type { LocalWorkspaceSetting, LocalWorkspaceStateValue } from '../../shared/conversation/workspaceApi'
import type { WebSettings, WebSettingsSnapshot } from '../../shared/network/webProtocol'
import type { LocalNotificationList } from '../../shared/notifications/notificationApi'
import type { LocalApproval } from '../../shared/permissions/approvalApi'
import type { BuddyPermissionSettings } from '../../shared/permissions/permissionMode'
import type { LocalCustomProvider, LocalCustomProviderModel, LocalDefaultModel, LocalProvider, LocalProviderAuthChallenge, LocalRuntimeModelOption } from '../../shared/providers/providerApi'
import type { LocalRun, LocalRunEvent } from '../../shared/runs/runApi'
import type { LocalBuddyServiceSupervisorState } from '../../shared/runtime/serviceState'
import type { LocalSkillCatalog } from '../../shared/skills/skillApi'

import type { LocalSpace, LocalSpaceCreateInput, LocalSpaceFile, LocalSpaceUpdateInput } from '../../shared/spaces/spaceApi'

import type { LocalUsageSnapshot } from '../../shared/usage/usageApi'

export const LOCAL_CHAT_IPC_CHANNELS = {
  webSettingsRead: 'lexora:buddy:web:settings',
  webSettingsSave: 'lexora:buddy:web:save-settings',
  webCredentialSave: 'lexora:buddy:web:save-credential',
  webCredentialReveal: 'lexora:buddy:web:reveal-credential',
  approvalsApprove: 'lexora:buddy:approvals:approve',
  approvalsApproveForTurn: 'lexora:buddy:approvals:approve-for-turn',
  approvalsDeny: 'lexora:buddy:approvals:deny',
  approvalsList: 'lexora:buddy:approvals:list',
  artifactsReadText: 'lexora:buddy:artifacts:read-text',
  automationChanged: 'lexora:buddy:automations:changed',
  automationsCreate: 'lexora:buddy:automations:create',
  automationsDelete: 'lexora:buddy:automations:delete',
  automationsDeleteOccurrence: 'lexora:buddy:automations:delete-occurrence',
  automationsGet: 'lexora:buddy:automations:get',
  automationsList: 'lexora:buddy:automations:list',
  automationsListOccurrences: 'lexora:buddy:automations:list-occurrences',
  automationsPause: 'lexora:buddy:automations:pause',
  automationsPreview: 'lexora:buddy:automations:preview',
  automationsResume: 'lexora:buddy:automations:resume',
  automationsRunNow: 'lexora:buddy:automations:run-now',
  automationsUpdate: 'lexora:buddy:automations:update',
  composerResourcesAccept: 'lexora:buddy:composer-resources:accept',
  composerResourcesComplete: 'lexora:buddy:composer-resources:complete',
  composerResourcesFail: 'lexora:buddy:composer-resources:fail',
  composerResourcesList: 'lexora:buddy:composer-resources:list',
  composerResourcesListSources: 'lexora:buddy:composer-resources:list-sources',
  composerResourcesRetry: 'lexora:buddy:composer-resources:retry',
  composerResourcesSelectFiles: 'lexora:buddy:composer-resources:select-files',
  composerResourcesSelectSource: 'lexora:buddy:composer-resources:select-source',
  composerResourcesSelectSpaceFile: 'lexora:buddy:composer-resources:select-space-file',
  composerDraftsGet: 'lexora:buddy:composer-drafts:get',
  composerDraftsOpen: 'lexora:buddy:composer-drafts:open',
  composerDraftsSave: 'lexora:buddy:composer-drafts:save',
  chatCancel: 'lexora:buddy:chat:cancel',
  chatEditUserMessage: 'lexora:buddy:chat:edit-user-message',
  chatExecuteCommand: 'lexora:buddy:chat:execute-command',
  chatRegenerateAssistant: 'lexora:buddy:chat:regenerate-assistant',
  chatStartTurn: 'lexora:buddy:chat:start-turn',
  changesGet: 'lexora:buddy:changes:get',
  contextUsageSnapshot: 'lexora:buddy:context:usage-snapshot',
  connectorsClearCredential: 'lexora:buddy:connectors:clear-credential',
  connectorsList: 'lexora:buddy:connectors:list',
  connectorsRemove: 'lexora:buddy:connectors:remove',
  connectorsSetCredential: 'lexora:buddy:connectors:set-credential',
  connectorsTrust: 'lexora:buddy:connectors:trust',
  connectorsUpsert: 'lexora:buddy:connectors:upsert',
  conversationsDelete: 'lexora:buddy:conversations:delete',
  conversationsActivateBranch: 'lexora:buddy:conversations:activate-branch',
  conversationsGet: 'lexora:buddy:conversations:get',
  conversationsGetNodeDetail: 'lexora:buddy:conversations:get-node-detail',
  conversationsGetTree: 'lexora:buddy:conversations:get-tree',
  conversationsList: 'lexora:buddy:conversations:list',
  conversationsListBranches: 'lexora:buddy:conversations:list-branches',
  conversationsListMessages: 'lexora:buddy:conversations:list-messages',
  conversationsRename: 'lexora:buddy:conversations:rename',
  conversationsSetPermissionSettings: 'lexora:buddy:conversations:set-permission-settings',
  conversationsSetModelSelection: 'lexora:buddy:conversations:set-model-selection',
  conversationsListTimeline: 'lexora:buddy:conversations:list-timeline',
  notificationsList: 'lexora:buddy:notifications:list',
  notificationsMarkAllSeen: 'lexora:buddy:notifications:mark-all-seen',
  notificationsMarkSeen: 'lexora:buddy:notifications:mark-seen',
  spacesCreate: 'lexora:buddy:spaces:create',
  spacesDelete: 'lexora:buddy:spaces:delete',
  spacesList: 'lexora:buddy:spaces:list',
  spacesSearchFiles: 'lexora:buddy:spaces:search-files',
  spacesSelectDirectory: 'lexora:buddy:spaces:select-directory',
  spacesUpdate: 'lexora:buddy:spaces:update',
  providerAuthChallenge: 'lexora:buddy:providers:auth-challenge',
  providersCancelAuth: 'lexora:buddy:providers:cancel-auth',
  providersAdd: 'lexora:buddy:providers:add',
  providersClearCredential: 'lexora:buddy:providers:clear-credential',
  providersGetDefaultModel: 'lexora:buddy:providers:get-default-model',
  providersList: 'lexora:buddy:providers:list',
  providersListModels: 'lexora:buddy:providers:list-models',
  providersLogin: 'lexora:buddy:providers:login',
  providersLogout: 'lexora:buddy:providers:logout',
  providersRemove: 'lexora:buddy:providers:remove',
  providersRespondToAuth: 'lexora:buddy:providers:respond-to-auth',
  providersSetDefaultModel: 'lexora:buddy:providers:set-default-model',
  providersSetEnabled: 'lexora:buddy:providers:set-enabled',
  providersSetModelEnabled: 'lexora:buddy:providers:set-model-enabled',
  providersSetModelParameters: 'lexora:buddy:providers:set-model-parameters',
  providersAcknowledgeModelSource: 'lexora:buddy:providers:acknowledge-model-source',
  providersRestoreModelSource: 'lexora:buddy:providers:restore-model-source',
  providersSyncModels: 'lexora:buddy:providers:sync-models',
  providersUpsertManualModel: 'lexora:buddy:providers:upsert-manual-model',
  providersUpsertCustom: 'lexora:buddy:providers:upsert-custom',
  runEvent: 'lexora:buddy:runs:event',
  runsGet: 'lexora:buddy:runs:get',
  runsList: 'lexora:buddy:runs:list',
  runsListEvents: 'lexora:buddy:runs:list-events',
  runtimeRestart: 'lexora:buddy:runtime:restart',
  runtimeStateChanged: 'lexora:buddy:runtime:state-changed',
  runtimeStatus: 'lexora:buddy:runtime:status',
  skillsList: 'lexora:buddy:skills:list',
  usageSnapshot: 'lexora:buddy:usage:snapshot',
  workspaceStateRead: 'lexora:buddy:workspace-state:read',
  workspaceStateWrite: 'lexora:buddy:workspace-state:write',
} as const

interface LocalMutationResult {
  ok: true
}

export interface LocalChatApi {
  composerDrafts: {
    get: (draftId: string) => Promise<LocalComposerDraft>
    open: (input: LocalComposerDraftOpen) => Promise<LocalComposerDraft>
    save: (input: LocalComposerDraftSave) => Promise<LocalComposerDraft>
  }
  artifacts: {
    readText: (artifactId: string) => Promise<LocalArtifactText>
  }
  automations: {
    create: (input: LocalAutomationCreateRequest) => Promise<LocalAutomation>
    delete: (input: LocalAutomationMutationRequest) => Promise<LocalAutomation>
    deleteOccurrence: (occurrenceId: string) => Promise<boolean>
    get: (automationId: string) => Promise<LocalAutomation>
    list: (input?: LocalAutomationListRequest) => Promise<LocalAutomationPage>
    listOccurrences: (
      input?: LocalAutomationOccurrenceListRequest,
    ) => Promise<LocalAutomationOccurrencePage>
    pause: (input: LocalAutomationMutationRequest) => Promise<LocalAutomation>
    preview: (input: LocalAutomationPreviewRequest) => Promise<LocalAutomationPreviewResult>
    resume: (input: LocalAutomationMutationRequest) => Promise<LocalAutomation>
    runNow: (input: LocalAutomationMutationRequest) => Promise<LocalAutomationRunNowResult>
    update: (input: LocalAutomationUpdateRequest) => Promise<LocalAutomation>
    onChanged: (listener: (automationId: string) => void) => () => void
  }
  runtime: {
    getStatus: () => Promise<LocalBuddyServiceSupervisorState>
    restart: () => Promise<LocalBuddyServiceSupervisorState>
    onStateChanged: (listener: (state: LocalBuddyServiceSupervisorState) => void) => () => void
  }
  providers: {
    acknowledgeModelSourceUpdate: (
      providerId: string,
      modelId: string,
    ) => Promise<LocalRuntimeModelOption>
    add: (providerId: string) => Promise<LocalProvider>
    clearCredential: (providerId: string) => Promise<LocalMutationResult>
    getDefaultModel: () => Promise<LocalDefaultModel | null>
    list: () => Promise<ReadonlyArray<LocalProvider>>
    listModels: (providerId?: string | null) => Promise<ReadonlyArray<LocalRuntimeModelOption>>
    login: (providerId: string, authType: 'api_key' | 'oauth') => Promise<LocalMutationResult>
    respondToAuth: (challengeId: string, value: string) => Promise<LocalMutationResult>
    cancelAuth: (challengeId: string) => Promise<LocalMutationResult>
    logout: (providerId: string) => Promise<LocalMutationResult>
    remove: (providerId: string) => Promise<LocalMutationResult>
    setDefaultModel: (
      model: LocalDefaultModel | null,
    ) => Promise<LocalDefaultModel | null>
    setEnabled: (providerId: string, enabled: boolean) => Promise<LocalProvider>
    setModelEnabled: (
      providerId: string,
      modelId: string,
      enabled: boolean,
    ) => Promise<LocalRuntimeModelOption>
    setModelParameters: (
      providerId: string,
      modelId: string,
      parameters: { contextWindow: number, maxTokens: number },
    ) => Promise<LocalRuntimeModelOption>
    restoreModelSourceParameters: (
      providerId: string,
      modelId: string,
    ) => Promise<LocalRuntimeModelOption>
    syncModels: (providerId: string) => Promise<ReadonlyArray<LocalRuntimeModelOption>>
    upsertManualModel: (
      providerId: string,
      model: LocalCustomProviderModel,
    ) => Promise<LocalRuntimeModelOption>
    upsertCustom: (provider: LocalCustomProvider) => Promise<LocalProvider>
    onAuthChallenge: (listener: (challenge: LocalProviderAuthChallenge) => void) => () => void
  }
  notifications: {
    list: () => Promise<LocalNotificationList>
    markAllSeen: () => Promise<LocalNotificationList>
    markSeen: (notificationId: string, revision: string) => Promise<LocalNotificationList>
  }
  spaces: {
    create: (input: LocalSpaceCreateInput) => Promise<LocalSpace>
    delete: (spaceId: string) => Promise<LocalMutationResult>
    list: (limit?: number) => Promise<ReadonlyArray<LocalSpace>>
    searchFiles: (spaceId: string, query: string) => Promise<ReadonlyArray<LocalSpaceFile>>
    selectDirectory: () => Promise<string | null>
    update: (input: LocalSpaceUpdateInput) => Promise<LocalSpace>
  }
  skills: {
    list: (spaceId?: string | null) => Promise<LocalSkillCatalog>
  }
  connectors: {
    list: () => Promise<ReadonlyArray<LocalConnector>>
    upsert: (input: {
      config: LocalConnectorConfig
      credential: LocalConnectorCredentialMutation
    }) => Promise<ReadonlyArray<LocalConnector>>
    remove: (connectorId: string) => Promise<LocalMutationResult>
    trust: (connectorId: string) => Promise<LocalMutationResult>
    setCredential: (
      connectorId: string,
      credential: LocalConnectorCredential,
    ) => Promise<LocalMutationResult>
    clearCredential: (connectorId: string) => Promise<LocalMutationResult>
  }
  context: {
    getUsageSnapshot: (
      input: LocalContextUsageSnapshotRequest,
    ) => Promise<LocalContextUsageSnapshot>
  }
  web: {
    read: () => Promise<WebSettingsSnapshot>
    save: (settings: WebSettings) => Promise<WebSettingsSnapshot>
    saveCredential: (key: string | null) => Promise<WebSettingsSnapshot>
    revealCredential: () => Promise<string | null>
  }
  workspaceState: {
    read: () => Promise<LocalWorkspaceSetting | null>
    write: (value: LocalWorkspaceStateValue) => Promise<LocalWorkspaceSetting>
  }
  conversations: {
    getNodeDetail: (input: ConversationNodeDetailRequest) => Promise<LocalConversationTimelinePage>
    getTree: (conversationId: string) => Promise<LocalConversationTree>
    list: (limit?: number) => Promise<ReadonlyArray<LocalConversationSummary>>
    get: (conversationId: string) => Promise<LocalConversation>
    delete: (conversationId: string) => Promise<boolean>
    activateBranch: (input: {
      branchId: string
      conversationId: string
    }) => Promise<LocalConversation>
    listBranches: (conversationId: string) => Promise<ReadonlyArray<LocalConversationBranch>>
    listMessages: (input: {
      branchId?: string
      conversationId: string
      cursor?: string
      limit?: number
    }) => Promise<LocalMessagePage>
    rename: (conversationId: string, title: string) => Promise<LocalConversation>
    setPermissionSettings: (
      conversationId: string,
      settings: BuddyPermissionSettings,
    ) => Promise<LocalConversation>
    setModelSelection: (
      conversationId: string,
      modelSelection: NonNullable<LocalConversation['modelSelection']>,
    ) => Promise<LocalConversation>
    listTimeline: (input: {
      branchId?: string
      conversationId: string
      cursor?: string
      limit?: number
    }) => Promise<LocalConversationTimelinePage>
  }
  changes: {
    get: (changeSetId: string) => Promise<LocalChangeSetDetail>
  }
  runs: {
    list: (input?: {
      conversationId?: string | null
      limit?: number
    }) => Promise<ReadonlyArray<LocalRun>>
    get: (runId: string) => Promise<LocalRun>
    listEvents: (input: {
      afterSequence?: number
      limit?: number
      runId: string
    } | {
      conversationId: string
      limit?: number
    }) => Promise<ReadonlyArray<LocalRunEvent>>
  }
  approvals: {
    list: (input?: {
      limit?: number
      runId?: string | null
      status?: 'pending' | 'approved' | 'denied' | 'cancelled' | null
    }) => Promise<ReadonlyArray<LocalApproval>>
    approve: (approvalId: string) => Promise<LocalApproval>
    approveForTurn: (approvalId: string) => Promise<LocalApproval>
    deny: (approvalId: string) => Promise<LocalApproval>
  }
  composerResources: {
    accept: (input: BuddyComposerResourceAccept) => Promise<readonly BuddyComposerResource[]>
    complete: (input: BuddyComposerResourceComplete) => Promise<BuddyComposerResource>
    fail: (input: BuddyComposerResourceTarget) => Promise<BuddyComposerResource>
    list: (draftId: string) => Promise<readonly BuddyComposerResource[]>
    listSources: (input: BuddyComposerSourceList) => Promise<BuddyComposerSourceListResponse>
    retry: (input: BuddyComposerResourceTarget) => Promise<BuddyComposerResource>
    selectFiles: (draftId: string, referencedResourceIds?: readonly string[]) => Promise<readonly BuddyComposerResource[]>
    selectSource: (input: BuddyComposerSourceSelect, referencedResourceIds?: readonly string[]) => Promise<BuddyComposerResource>
    selectSpaceFile: (input: BuddyComposerSpaceFileSelect, referencedResourceIds?: readonly string[]) => Promise<BuddyComposerResource>
  }
  usage: {
    getSnapshot: () => Promise<LocalUsageSnapshot>
  }
  chat: {
    editUserMessage: (input: {
      conversationId: string
      draftId: string
      expectedRevision: number
      requestId: string
      userMessageId: string
    }) => Promise<LocalTurnStart>
    executeCommand: (request: LocalChatCommandRequest) => Promise<LocalTurnStart>
    startTurn: (request: LocalStartTurnRequest) => Promise<LocalTurnStart>
    regenerateAssistant: (input: {
      conversationId: string
      requestId: string
      sourceRunId: string
    }) => Promise<LocalTurnStart>
    cancel: (runId: string) => Promise<LocalRun>
    onRunEvent: (listener: (event: LocalRunEvent) => void) => () => void
  }
}
