import type {
  DesktopAppInfo,
  DesktopOpenTarget,
  DesktopWindowState,
  LexoraConfigPatch,
  LexoraDesktopApi,
} from '../shared/desktopApi'
import type { DesktopCommandId } from '../shared/desktopCommands'
import type {
  LocalBuddyServiceSupervisorState,
  LocalChatApi,
  LocalProviderAuthChallenge,
  LocalRunEvent,
} from '../shared/localChatApi'
import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC_CHANNELS } from '../shared/desktopApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../shared/localChatApi'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const localChatApi = Object.freeze<LocalChatApi>({
  automations: Object.freeze({
    create: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsCreate, input),
    delete: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsDelete, input),
    deleteOccurrence: occurrenceId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.automationsDeleteOccurrence,
      { occurrenceId },
    ),
    get: automationId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.automationsGet,
      { automationId },
    ),
    list: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsList, input ?? {}),
    listOccurrences: input => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.automationsListOccurrences,
      input ?? {},
    ),
    pause: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsPause, input),
    preview: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsPreview, input),
    resume: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsResume, input),
    runNow: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsRunNow, input),
    update: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsUpdate, input),
    onChanged: listener => subscribe<string>(LOCAL_CHAT_IPC_CHANNELS.automationChanged, listener),
  }),
  runtime: Object.freeze({
    cancelDataOperation: operationId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeCancelDataOperation,
      { operationId },
    ),
    deleteDataBackup: backupId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeDeleteDataBackup,
      { backupId },
    ),
    getDataBackupStorage: () => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataBackupStorage,
    ),
    getDataRecoveryReceipt: () => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataRecoveryReceipt,
    ),
    getDataOperation: () => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataOperation,
    ),
    getStatus: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runtimeStatus),
    listDataBackups: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runtimeListDataBackups),
    openDataDirectory: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runtimeOpenDataDirectory),
    restart: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runtimeRestart),
    startDataBackup: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runtimeStartDataBackup),
    startDataRestore: backupId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeStartDataRestore,
      { backupId },
    ),
    validateDataBackup: backupId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.runtimeValidateDataBackup,
      { backupId },
    ),
    onDataOperationChanged: listener => subscribe(
      LOCAL_CHAT_IPC_CHANNELS.runtimeDataOperationChanged,
      listener,
    ),
    onStateChanged: (listener: (state: LocalBuddyServiceSupervisorState) => void) =>
      subscribe(LOCAL_CHAT_IPC_CHANNELS.runtimeStateChanged, listener),
  }),
  providers: Object.freeze({
    acknowledgeModelSourceUpdate: (providerId, modelId) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersAcknowledgeModelSource,
      { modelId, providerId },
    ),
    add: providerId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersAdd, { providerId }),
    clearCredential: providerId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersClearCredential,
      { providerId },
    ),
    getDefaultModel: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersGetDefaultModel),
    list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersList),
    listModels: providerId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersListModels, { providerId }),
    login: (providerId, authType) =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersLogin, { authType, providerId }),
    respondToAuth: (challengeId, value) =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersRespondToAuth, { challengeId, value }),
    cancelAuth: challengeId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersCancelAuth, { challengeId }),
    logout: providerId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersLogout, { providerId }),
    remove: providerId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersRemove, { providerId }),
    setDefaultModel: model => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersSetDefaultModel,
      { model },
    ),
    setEnabled: (providerId, enabled) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersSetEnabled,
      { enabled, providerId },
    ),
    setModelEnabled: (providerId, modelId, enabled) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersSetModelEnabled,
      { enabled, modelId, providerId },
    ),
    setModelParameters: (providerId, modelId, parameters) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersSetModelParameters,
      { modelId, parameters, providerId },
    ),
    restoreModelSourceParameters: (providerId, modelId) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersRestoreModelSource,
      { modelId, providerId },
    ),
    syncModels: providerId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersSyncModels,
      { providerId },
    ),
    upsertManualModel: (providerId, model) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.providersUpsertManualModel,
      { model, providerId },
    ),
    upsertCustom: provider =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.providersUpsertCustom, { provider }),
    onAuthChallenge: (listener: (challenge: LocalProviderAuthChallenge) => void) =>
      subscribe(LOCAL_CHAT_IPC_CHANNELS.providerAuthChallenge, listener),
  }),
  notifications: Object.freeze({
    list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.notificationsList),
    markAllSeen: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.notificationsMarkAllSeen),
    markSeen: (notificationId, revision) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.notificationsMarkSeen,
      { notificationId, revision },
    ),
  }),
  projects: Object.freeze({
    create: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsCreate, input),
    delete: projectId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsDelete, { projectId }),
    list: limit => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsList, { limit }),
    searchFiles: (projectId, query) =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsSearchFiles, { projectId, query }),
    selectDirectory: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsSelectDirectory),
    update: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.projectsUpdate, input),
  }),
  skills: Object.freeze({
    list: projectId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.skillsList, { projectId: projectId ?? null }),
  }),
  connectors: Object.freeze({
    list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsList),
    upsert: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsUpsert, input),
    remove: connectorId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsRemove, { connectorId }),
    trust: connectorId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsTrust, { connectorId }),
    setCredential: (connectorId, credential) =>
      ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.connectorsSetCredential,
        { connectorId, credential },
      ),
    clearCredential: connectorId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsClearCredential, { connectorId }),
  }),
  context: Object.freeze({
    getUsageSnapshot: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.contextUsageSnapshot, input),
  }),
  workspaceState: Object.freeze({
    read: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.workspaceStateRead),
    write: value => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.workspaceStateWrite, { value }),
  }),
  conversations: Object.freeze({
    list: limit => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsList, { limit }),
    get: conversationId => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.conversationsGet,
      { conversationId },
    ),
    delete: conversationId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsDelete, { conversationId }),
    activateBranch: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsActivateBranch, input),
    listBranches: conversationId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsListBranches, { conversationId }),
    listMessages: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsListMessages, input),
    rename: (conversationId, title) =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsRename, { conversationId, title }),
    setExecutionProfile: (conversationId, executionProfile) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.conversationsSetExecutionProfile,
      { conversationId, executionProfile },
    ),
    setModelSelection: (conversationId, modelSelection) => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.conversationsSetModelSelection,
      { conversationId, modelSelection },
    ),
    listTimeline: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.conversationsListTimeline, input),
  }),
  runs: Object.freeze({
    list: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runsList, input ?? {}),
    get: runId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runsGet, { runId }),
    listEvents: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.runsListEvents, input),
  }),
  approvals: Object.freeze({
    list: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.approvalsList, input ?? {}),
    approve: approvalId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.approvalsApprove, { approvalId }),
    deny: approvalId =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.approvalsDeny, { approvalId }),
  }),
  attachments: Object.freeze({
    importFiles: input => ipcRenderer.invoke(
      LOCAL_CHAT_IPC_CHANNELS.attachmentsImportFiles,
      input,
    ),
    selectFiles: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.attachmentsSelectFiles, input),
    release: attachmentIds =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.attachmentsRelease, { attachmentIds }),
    cleanupDrafts: () =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.attachmentsCleanupDrafts, {}),
  }),
  usage: Object.freeze({
    getSnapshot: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.usageSnapshot),
  }),
  chat: Object.freeze({
    editUserMessage: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.chatEditUserMessage, input),
    executeCommand: request =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.chatExecuteCommand, request),
    startTurn: request => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.chatStartTurn, request),
    regenerateAssistant: input =>
      ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.chatRegenerateAssistant, input),
    cancel: runId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.chatCancel, { runId }),
    onRunEvent: (listener: (event: LocalRunEvent) => void) =>
      subscribe(LOCAL_CHAT_IPC_CHANNELS.runEvent, listener),
  }),
})

const desktopApi: LexoraDesktopApi = Object.freeze({
  app: Object.freeze({
    checkForUpdates: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appCheckForUpdates),
    getInfo: (): Promise<DesktopAppInfo> => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appGetInfo),
    onOpenTarget: (listener: (target: DesktopOpenTarget) => void) => (
      subscribe(DESKTOP_IPC_CHANNELS.appOpenTarget, listener)
    ),
    openFeedbackIssue: (feedback: string) => ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.appOpenFeedbackIssue,
      { feedback },
    ),
    openReleasePage: (url: string) => ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.appOpenReleasePage,
      { url },
    ),
  }),
  clipboard: Object.freeze({
    writeText: (text: string) => ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.clipboardWriteText,
      { text },
    ),
  }),
  commands: Object.freeze({
    execute: (commandId: DesktopCommandId) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.commandExecute, commandId),
  }),
  settings: Object.freeze({
    get: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.settingsGet),
    update: (patch: LexoraConfigPatch) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.settingsUpdate, patch),
  }),
  window: Object.freeze({
    getState: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowGetState),
    minimize: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowMinimize),
    onStateChanged: (listener: (state: DesktopWindowState) => void) =>
      subscribe(DESKTOP_IPC_CHANNELS.windowStateChanged, listener),
    toggleAlwaysOnTop: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowToggleAlwaysOnTop),
    toggleMaximize: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowToggleMaximize),
  }),
  localChat: localChatApi,
})

contextBridge.exposeInMainWorld('lexoraDesktop', desktopApi)
