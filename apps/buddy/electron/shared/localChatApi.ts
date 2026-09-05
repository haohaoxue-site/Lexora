import type { BuddyAttachmentImportRequest } from '../../shared/attachmentPolicy'
import type { BuddyPermissionSettings } from '../../shared/permissionMode'
import type { WebSettings, WebSettingsSnapshot } from '../../shared/webProtocol'
import type {
  LocalApproval,
  LocalArtifactText,
  LocalAttachment,
  LocalAutomation,
  LocalAutomationCreateRequest,
  LocalAutomationListRequest,
  LocalAutomationMutationRequest,
  LocalAutomationOccurrenceListRequest,
  LocalAutomationOccurrencePage,
  LocalAutomationPage,
  LocalAutomationPreviewRequest,
  LocalAutomationPreviewResult,
  LocalAutomationRunNowResult,
  LocalAutomationUpdateRequest,
  LocalBuddyServiceSupervisorState,
  LocalChangeSetDetail,
  LocalChatCommandRequest,
  LocalConnector,
  LocalConnectorConfig,
  LocalConnectorCredential,
  LocalConnectorCredentialMutation,
  LocalContextUsageSnapshot,
  LocalContextUsageSnapshotRequest,
  LocalConversation,
  LocalConversationBranch,
  LocalConversationSummary,
  LocalConversationTimelinePage,
  LocalCustomProvider,
  LocalCustomProviderModel,
  LocalDefaultModel,
  LocalMessagePage,
  LocalNotificationList,
  LocalPromptContextItem,
  LocalProvider,
  LocalProviderAuthChallenge,
  LocalRun,
  LocalRunEvent,
  LocalRuntimeDataBackup,
  LocalRuntimeDataBackupStorage,
  LocalRuntimeDataOperation,
  LocalRuntimeDataRecoveryReceipt,
  LocalRuntimeModelOption,
  LocalSkillCatalog,
  LocalSpace,
  LocalSpaceCreateInput,
  LocalSpaceFile,
  LocalSpaceUpdateInput,
  LocalStartTurnRequest,
  LocalTurnStart,
  LocalUsageSnapshot,
  LocalWorkspaceSetting,
  LocalWorkspaceStateValue,
} from './localChatApiSchemas'

export type LocalChatErrorCode
  = | 'APPROVAL_REQUIRED'
    | 'AUTOMATION_CONFLICT'
    | 'AUTOMATION_INVALID_SCHEDULE'
    | 'AUTOMATION_NOT_FOUND'
    | 'AUTHENTICATION_REQUIRED'
    | 'CONNECTOR_UNAVAILABLE'
    | 'CREDENTIAL_STORE_UNAVAILABLE'
    | 'DIRECTORY_NOT_AUTHORIZED'
    | 'LOCAL_CHAT_OPERATION_FAILED'
    | 'MODEL_SYNC_FAILED'
    | 'MODEL_SYNC_UNSUPPORTED'
    | 'PATH_OUTSIDE_GRANTED_DIRECTORY'
    | 'SPACE_HAS_ACTIVE_RUNS'
    | 'SPACE_UNAVAILABLE'
    | 'PROVIDER_HAS_ACTIVE_RUNS'
    | 'PROVIDER_LOGIN_CANCELLED'
    | 'PROVIDER_UNAVAILABLE'
    | 'RUNTIME_PROTOCOL_ERROR'
    | 'RUNTIME_UNAVAILABLE'
    | 'VALIDATION_FAILED'

export interface LocalChatPublicError {
  code: LocalChatErrorCode
  retryable: boolean
}

const LOCAL_CHAT_ERROR_MARKER = 'LEXORA_LOCAL_CHAT_ERROR'
const LOCAL_CHAT_ERROR_PATTERN = /LEXORA_LOCAL_CHAT_ERROR:([A-Z0-9_]+):(0|1)/
const LOCAL_CHAT_ERROR_CODES = new Set<LocalChatErrorCode>([
  'APPROVAL_REQUIRED',
  'AUTOMATION_CONFLICT',
  'AUTOMATION_INVALID_SCHEDULE',
  'AUTOMATION_NOT_FOUND',
  'AUTHENTICATION_REQUIRED',
  'CONNECTOR_UNAVAILABLE',
  'CREDENTIAL_STORE_UNAVAILABLE',
  'DIRECTORY_NOT_AUTHORIZED',
  'LOCAL_CHAT_OPERATION_FAILED',
  'MODEL_SYNC_FAILED',
  'MODEL_SYNC_UNSUPPORTED',
  'PATH_OUTSIDE_GRANTED_DIRECTORY',
  'SPACE_HAS_ACTIVE_RUNS',
  'SPACE_UNAVAILABLE',
  'PROVIDER_HAS_ACTIVE_RUNS',
  'PROVIDER_LOGIN_CANCELLED',
  'PROVIDER_UNAVAILABLE',
  'RUNTIME_PROTOCOL_ERROR',
  'RUNTIME_UNAVAILABLE',
  'VALIDATION_FAILED',
])

export function formatLocalChatPublicError(error: LocalChatPublicError): string {
  return `${LOCAL_CHAT_ERROR_MARKER}:${error.code}:${error.retryable ? '1' : '0'}`
}

export function parseLocalChatPublicError(message: string): LocalChatPublicError | null {
  const match = LOCAL_CHAT_ERROR_PATTERN.exec(message)
  if (!match || !isLocalChatErrorCode(match[1]))
    return null
  return { code: match[1], retryable: match[2] === '1' }
}

export function isLocalChatErrorCode(value: string | undefined): value is LocalChatErrorCode {
  return Boolean(value && LOCAL_CHAT_ERROR_CODES.has(value as LocalChatErrorCode))
}

export type {
  LocalApproval,
  LocalArtifact,
  LocalArtifactText,
  LocalAttachment,
  LocalAutomation,
  LocalAutomationCreateRequest,
  LocalAutomationListItem,
  LocalAutomationListRequest,
  LocalAutomationMutationRequest,
  LocalAutomationOccurrence,
  LocalAutomationOccurrenceListRequest,
  LocalAutomationOccurrencePage,
  LocalAutomationPage,
  LocalAutomationPreviewRequest,
  LocalAutomationPreviewResult,
  LocalAutomationRunNowResult,
  LocalAutomationUpdateRequest,
  LocalBuddyServiceSupervisorState,
  LocalChangeSetDetail,
  LocalChangeSetSummary,
  LocalChatCommandRequest,
  LocalConnector,
  LocalConnectorConfig,
  LocalConnectorCredential,
  LocalConnectorCredentialMutation,
  LocalContextUsageSnapshot,
  LocalContextUsageSnapshotRequest,
  LocalConversation,
  LocalConversationBranch,
  LocalConversationSummary,
  LocalConversationTimelineItem,
  LocalConversationTimelinePage,
  LocalCustomProvider,
  LocalCustomProviderModel,
  LocalDefaultModel,
  LocalFileChangeDetail,
  LocalMessage,
  LocalMessagePage,
  LocalNotification,
  LocalNotificationList,
  LocalPromptContextItem,
  LocalProvider,
  LocalProviderAuthChallenge,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
  LocalRuntimeDataBackup,
  LocalRuntimeDataBackupStorage,
  LocalRuntimeDataOperation,
  LocalRuntimeDataRecoveryReceipt,
  LocalRuntimeDataRestore,
  LocalRuntimeModelOption,
  LocalSkillCatalog,
  LocalSpace,
  LocalSpaceAdditionalDirectory,
  LocalSpaceCreateInput,
  LocalSpaceFile,
  LocalSpacePrimaryDirectory,
  LocalSpaceUpdateInput,
  LocalStartTurnRequest,
  LocalTurnStart,
  LocalUsageSnapshot,
  LocalWorkspaceDraft,
  LocalWorkspaceSetting,
  LocalWorkspaceStateValue,
} from './localChatApiSchemas'

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
  attachmentsCleanupDrafts: 'lexora:buddy:attachments:cleanup-drafts',
  attachmentsImportFiles: 'lexora:buddy:attachments:import-files',
  attachmentsRelease: 'lexora:buddy:attachments:release',
  attachmentsSelectFiles: 'lexora:buddy:attachments:select-files',
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
  runtimeCancelDataOperation: 'lexora:buddy:runtime:cancel-data-operation',
  runtimeDataOperationChanged: 'lexora:buddy:runtime:data-operation-changed',
  runtimeDeleteDataBackup: 'lexora:buddy:runtime:delete-data-backup',
  runtimeGetDataBackupStorage: 'lexora:buddy:runtime:get-data-backup-storage',
  runtimeGetDataRecoveryReceipt: 'lexora:buddy:runtime:get-data-recovery-receipt',
  runtimeGetDataOperation: 'lexora:buddy:runtime:get-data-operation',
  runtimeListDataBackups: 'lexora:buddy:runtime:list-data-backups',
  runtimeOpenDataDirectory: 'lexora:buddy:runtime:open-data-directory',
  runtimeRestart: 'lexora:buddy:runtime:restart',
  runtimeStartDataBackup: 'lexora:buddy:runtime:start-data-backup',
  runtimeStartDataRestore: 'lexora:buddy:runtime:start-data-restore',
  runtimeStateChanged: 'lexora:buddy:runtime:state-changed',
  runtimeStatus: 'lexora:buddy:runtime:status',
  runtimeValidateDataBackup: 'lexora:buddy:runtime:validate-data-backup',
  skillsList: 'lexora:buddy:skills:list',
  usageSnapshot: 'lexora:buddy:usage:snapshot',
  workspaceStateRead: 'lexora:buddy:workspace-state:read',
  workspaceStateWrite: 'lexora:buddy:workspace-state:write',
} as const

interface LocalMutationResult {
  ok: true
}

export interface LocalChatApi {
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
    cancelDataOperation: (operationId: string) => Promise<LocalRuntimeDataOperation>
    deleteDataBackup: (backupId: string) => Promise<{ readonly deletedBackupId: string }>
    getDataBackupStorage: () => Promise<LocalRuntimeDataBackupStorage>
    getDataRecoveryReceipt: () => Promise<LocalRuntimeDataRecoveryReceipt | null>
    getDataOperation: () => Promise<LocalRuntimeDataOperation | null>
    getStatus: () => Promise<LocalBuddyServiceSupervisorState>
    listDataBackups: () => Promise<ReadonlyArray<LocalRuntimeDataBackup>>
    openDataDirectory: () => Promise<LocalMutationResult>
    restart: () => Promise<LocalBuddyServiceSupervisorState>
    startDataBackup: () => Promise<LocalRuntimeDataOperation>
    startDataRestore: (backupId: string) => Promise<LocalRuntimeDataOperation>
    validateDataBackup: (backupId: string) => Promise<LocalRuntimeDataBackup>
    onDataOperationChanged: (listener: (operation: LocalRuntimeDataOperation) => void) => () => void
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
  attachments: {
    importFiles: (
      input: BuddyAttachmentImportRequest,
    ) => Promise<ReadonlyArray<LocalAttachment>>
    selectFiles: (input: {
      draftId: string
      remainingCount: number
    }) => Promise<ReadonlyArray<LocalAttachment>>
    release: (
      attachmentIds: ReadonlyArray<string>,
    ) => Promise<{ releasedAttachmentIds: ReadonlyArray<string> }>
    cleanupDrafts: () => Promise<{ releasedAttachmentIds: ReadonlyArray<string> }>
  }
  usage: {
    getSnapshot: () => Promise<LocalUsageSnapshot>
  }
  chat: {
    editUserMessage: (input: {
      attachmentIds: ReadonlyArray<string>
      content: string
      contextItems: ReadonlyArray<LocalPromptContextItem>
      conversationId: string
      draftId: string
      modelSelection: LocalStartTurnRequest['modelSelection']
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
