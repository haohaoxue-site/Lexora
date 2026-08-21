import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import type { ZodType } from 'zod'
import type { LexoraConfig } from '../shared/desktopApi'
import type { LocalChatErrorCode } from '../shared/localChatApi'
import { dialog, ipcMain } from 'electron'
import { z, ZodError } from 'zod'
import { BUDDY_ATTACHMENT_DIALOG_EXTENSIONS } from '../../shared/attachmentPolicy'
import { toPublicRunEvent } from '../../shared/publicRunEvent'

import {
  formatLocalChatPublicError,
  isLocalChatErrorCode,
  LOCAL_CHAT_IPC_CHANNELS,
} from '../shared/localChatApi'
import {
  LOCAL_WORKSPACE_STATE_KEY,
  localChatResponseSchemas,
  localChatSchemas,
} from '../shared/localChatApiSchemas'
import { translateDesktopNative } from './desktopNativeI18n'
import { assertTrustedSender } from './ipc'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const PROVIDER_LOGIN_TIMEOUT_MS = 10 * 60_000

export interface DesktopRuntimeGateway {
  readonly state: unknown
  onNotification: (
    listener: (notification: { method: string, params: unknown }) => void,
  ) => () => void
  onStateChange: (listener: (state: unknown) => void) => () => void
  request: (
    method: string,
    params: unknown,
    options?: { timeoutMs?: number },
  ) => Promise<unknown>
  restart: () => Promise<void>
}

export interface DesktopRuntimeRecoveryGateway {
  cancelDataOperation: (operationId: string) => unknown
  deleteDataBackup: (backupId: string) => Promise<unknown>
  getDataBackupStorage: () => Promise<unknown>
  getDataRecoveryReceipt: () => unknown
  getDataOperation: () => unknown
  listDataBackups: () => Promise<unknown>
  onDataOperationChange: (listener: (operation: unknown) => void) => () => void
  openDataDirectory: () => Promise<unknown>
  startDataBackup: () => unknown
  startDataRestore: (backupId: string) => unknown
  validateDataBackup: (backupId: string) => Promise<unknown>
}

export interface RegisterLocalChatIpcOptions {
  getLanguage: () => LexoraConfig['desktop']['language']
  getWindow: () => BrowserWindow | null
  runtime: DesktopRuntimeGateway
  runtimeRecovery: DesktopRuntimeRecoveryGateway
}

export function registerLocalChatIpc(options: RegisterLocalChatIpcOptions): () => void {
  const registeredChannels: string[] = []
  const handle = <T>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, input: T) => unknown,
  ) => {
    registeredChannels.push(channel)
    ipcMain.handle(channel, async (event, input: T) => {
      try {
        assertTrustedSender(event, options.getWindow())
        return await handler(event, input)
      }
      catch (error) {
        throw createLocalChatIpcError(error)
      }
    })
  }
  const request = async <T>(
    method: string,
    params: unknown,
    schema: ZodType<T>,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> => {
    const result = schema.safeParse(await options.runtime.request(method, params, { timeoutMs }))
    if (!result.success)
      throw new DesktopRuntimeResponseError()
    return result.data
  }

  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeStatus, () => (
    localChatResponseSchemas.runtimeState.parse(options.runtime.state)
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeRestart, async () => {
    await options.runtime.restart()
    return localChatResponseSchemas.runtimeState.parse(options.runtime.state)
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeStartDataBackup, () => (
    localChatResponseSchemas.runtimeDataOperation.parse(
      options.runtimeRecovery.startDataBackup(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeCancelDataOperation, (_event, input) => {
    const { operationId } = localChatSchemas.runtimeDataOperationId.parse(input)
    return localChatResponseSchemas.runtimeDataOperation.parse(
      options.runtimeRecovery.cancelDataOperation(operationId),
    )
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeDeleteDataBackup, async (_event, input) => {
    const { backupId } = localChatSchemas.runtimeDataBackupId.parse(input)
    return localChatResponseSchemas.runtimeDataBackupDeletion.parse(
      await options.runtimeRecovery.deleteDataBackup(backupId),
    )
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataBackupStorage, async () => (
    localChatResponseSchemas.runtimeDataBackupStorage.parse(
      await options.runtimeRecovery.getDataBackupStorage(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataRecoveryReceipt, () => (
    localChatResponseSchemas.optionalRuntimeDataRecoveryReceipt.parse(
      options.runtimeRecovery.getDataRecoveryReceipt(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeGetDataOperation, () => (
    localChatResponseSchemas.optionalRuntimeDataOperation.parse(
      options.runtimeRecovery.getDataOperation(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeListDataBackups, async () => (
    localChatResponseSchemas.runtimeDataBackups.parse(
      await options.runtimeRecovery.listDataBackups(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeOpenDataDirectory, async () => (
    localChatResponseSchemas.mutation.parse(
      await options.runtimeRecovery.openDataDirectory(),
    )
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeStartDataRestore, (_event, input) => {
    const { backupId } = localChatSchemas.runtimeDataBackupId.parse(input)
    return localChatResponseSchemas.runtimeDataOperation.parse(
      options.runtimeRecovery.startDataRestore(backupId),
    )
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeValidateDataBackup, async (_event, input) => {
    const { backupId } = localChatSchemas.runtimeDataBackupId.parse(input)
    return localChatResponseSchemas.runtimeDataBackup.parse(
      await options.runtimeRecovery.validateDataBackup(backupId),
    )
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.providersList, () => request(
    'providers.list',
    {},
    localChatResponseSchemas.providers,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersAdd, (_event, input) => request(
    'providers.add',
    localChatSchemas.providerId.parse(input),
    localChatResponseSchemas.provider,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersListModels, (_event, input) => request(
    'providers.listModels',
    localChatSchemas.listModels.parse(input),
    localChatResponseSchemas.models,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersGetDefaultModel, () => request(
    'providers.getDefaultModel',
    {},
    localChatResponseSchemas.optionalDefaultModel,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersLogin, (_event, input) => request(
    'providers.login',
    localChatSchemas.providerLogin.parse(input),
    localChatResponseSchemas.mutation,
    PROVIDER_LOGIN_TIMEOUT_MS,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersRespondToAuth, (_event, input) => request(
    'providers.respondToAuth',
    localChatSchemas.providerAuthResponse.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersCancelAuth, (_event, input) => request(
    'providers.cancelAuth',
    localChatSchemas.providerAuthCancel.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersLogout, (_event, input) => request(
    'providers.logout',
    localChatSchemas.providerId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersClearCredential, (_event, input) => request(
    'providers.clearCredential',
    localChatSchemas.providerId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersRemove, (_event, input) => request(
    'providers.remove',
    localChatSchemas.providerId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersSetEnabled, (_event, input) => request(
    'providers.setEnabled',
    localChatSchemas.providerEnabled.parse(input),
    localChatResponseSchemas.provider,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersSetModelEnabled, (_event, input) => request(
    'providers.setModelEnabled',
    localChatSchemas.providerModelEnabled.parse(input),
    localChatResponseSchemas.model,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersSetModelParameters, (_event, input) => request(
    'providers.setModelParameters',
    localChatSchemas.providerModelParameters.parse(input),
    localChatResponseSchemas.model,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersAcknowledgeModelSource, (_event, input) => request(
    'providers.acknowledgeModelSourceUpdate',
    localChatSchemas.providerModel.parse(input),
    localChatResponseSchemas.model,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersRestoreModelSource, (_event, input) => request(
    'providers.restoreModelSourceParameters',
    localChatSchemas.providerModel.parse(input),
    localChatResponseSchemas.model,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersSetDefaultModel, (_event, input) => request(
    'providers.setDefaultModel',
    localChatSchemas.defaultModel.parse(input),
    localChatResponseSchemas.optionalDefaultModel,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersSyncModels, (_event, input) => request(
    'providers.syncModels',
    localChatSchemas.providerId.parse(input),
    localChatResponseSchemas.models,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersUpsertManualModel, (_event, input) => request(
    'providers.upsertManualModel',
    localChatSchemas.providerManualModel.parse(input),
    localChatResponseSchemas.model,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.providersUpsertCustom, (_event, input) => {
    const { provider } = localChatSchemas.providerUpsert.parse(input)
    return request('providers.upsertCustom', provider, localChatResponseSchemas.provider)
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.notificationsList, () => request(
    'notifications.list',
    {},
    localChatResponseSchemas.notificationList,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.notificationsMarkSeen, (_event, input) => request(
    'notifications.markSeen',
    localChatSchemas.notificationRevision.parse(input),
    localChatResponseSchemas.notificationList,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.notificationsMarkAllSeen, () => request(
    'notifications.markAllSeen',
    {},
    localChatResponseSchemas.notificationList,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.projectsCreate, (_event, input) => request(
    'projects.create',
    localChatSchemas.projectCreate.parse(input),
    localChatResponseSchemas.project,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.projectsDelete, (_event, input) => request(
    'projects.delete',
    localChatSchemas.projectId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.projectsList, (_event, input) => request(
    'projects.list',
    localChatSchemas.limit.parse(input),
    localChatResponseSchemas.projects,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.projectsSearchFiles, (_event, input) => request(
    'projects.searchFiles',
    localChatSchemas.projectFileSearch.parse(input),
    localChatResponseSchemas.projectFiles,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.projectsSelectDirectory, async () => {
    const paths = await selectPaths(options.getWindow(), {
      properties: ['openDirectory'],
      title: translateDesktopNative(options.getLanguage(), 'selectProjectDirectory'),
    })
    return paths[0] ?? null
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.projectsUpdate, (_event, input) => request(
    'projects.update',
    localChatSchemas.projectUpdate.parse(input),
    localChatResponseSchemas.project,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.skillsList, (_event, input) => request(
    'skills.list',
    localChatSchemas.skillScope.parse(input),
    localChatResponseSchemas.skills,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsList, () => request(
    'connectors.list',
    {},
    localChatResponseSchemas.connectors,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsUpsert, (_event, input) => {
    const update = localChatSchemas.connectorUpsert.parse(input)
    return request('connectors.upsert', update, localChatResponseSchemas.connectors)
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsRemove, (_event, input) => request(
    'connectors.remove',
    localChatSchemas.connectorId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsTrust, (_event, input) => request(
    'connectors.trust',
    localChatSchemas.connectorId.parse(input),
    localChatResponseSchemas.mutation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsSetCredential, async (_event, input) => {
    const { connectorId, credential } = localChatSchemas.connectorCredential.parse(input)
    return request(
      'connectors.saveCredential',
      { connectorId, credential },
      localChatResponseSchemas.mutation,
    )
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsClearCredential, async (_event, input) => {
    const { connectorId } = localChatSchemas.connectorId.parse(input)
    return request(
      'connectors.clearCredential',
      { connectorId },
      localChatResponseSchemas.mutation,
    )
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.contextUsageSnapshot, (_event, input) => request(
    'context.usageSnapshot',
    localChatSchemas.contextUsageSnapshot.parse(input),
    localChatResponseSchemas.contextUsageSnapshot,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.workspaceStateRead, () => request(
    'workspaceState.read',
    { key: LOCAL_WORKSPACE_STATE_KEY },
    localChatResponseSchemas.optionalWorkspaceSetting,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.workspaceStateWrite, (_event, input) => {
    const { value } = localChatSchemas.workspaceValue.parse(input)
    return request(
      'workspaceState.write',
      { key: LOCAL_WORKSPACE_STATE_KEY, value },
      localChatResponseSchemas.workspaceSetting,
    )
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsList, (_event, input) => request(
    'conversations.list',
    localChatSchemas.limit.parse(input),
    localChatResponseSchemas.conversations,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsDelete, (_event, input) => request(
    'conversations.delete',
    localChatSchemas.conversationId.parse(input),
    localChatResponseSchemas.deleted,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsActivateBranch, (_event, input) => request(
    'conversations.activateBranch',
    localChatSchemas.conversationBranchActivation.parse(input),
    localChatResponseSchemas.conversation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsListBranches, (_event, input) => request(
    'conversations.listBranches',
    localChatSchemas.conversationId.parse(input),
    localChatResponseSchemas.conversationBranches,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsListMessages, (_event, input) => request(
    'conversations.listMessages',
    localChatSchemas.conversationMessages.parse(input),
    localChatResponseSchemas.messagePage,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsRename, (_event, input) => request(
    'conversations.rename',
    localChatSchemas.conversationRename.parse(input),
    localChatResponseSchemas.conversation,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.conversationsListTimeline, (_event, input) => request(
    'conversations.listTimeline',
    localChatSchemas.conversationTimeline.parse(input),
    localChatResponseSchemas.timelinePage,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.runsList, (_event, input) => request(
    'runs.list',
    localChatSchemas.listRuns.parse(input),
    localChatResponseSchemas.runs,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runsGet, (_event, input) => request(
    'runs.get',
    localChatSchemas.runId.parse(input),
    localChatResponseSchemas.run,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.runsListEvents, async (_event, input) => {
    const events = await request(
      'runs.listEvents',
      localChatSchemas.runEvents.parse(input),
      z.array(localChatSchemas.runStateEvent),
    )
    return localChatResponseSchemas.runEvents.parse(events.map(toPublicRunEvent))
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.approvalsList, (_event, input) => request(
    'approvals.list',
    localChatSchemas.listApprovals.parse(input),
    localChatResponseSchemas.approvals,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.approvalsApprove, (_event, input) => request(
    'approvals.approve',
    localChatSchemas.approvalId.parse(input),
    localChatResponseSchemas.approval,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.approvalsDeny, (_event, input) => request(
    'approvals.deny',
    localChatSchemas.approvalId.parse(input),
    localChatResponseSchemas.approval,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.attachmentsSelectFiles, async (_event, input) => {
    const { remainingCount } = localChatSchemas.attachmentSelection.parse(input)
    const paths = await selectPaths(options.getWindow(), {
      filters: [{
        extensions: [...BUDDY_ATTACHMENT_DIALOG_EXTENSIONS],
        name: 'Lexora Buddy',
      }],
      properties: ['openFile', 'multiSelections'],
      title: translateDesktopNative(options.getLanguage(), 'selectAttachments'),
    })
    if (paths.length === 0)
      return []
    return request(
      'attachments.registerFiles',
      { paths: paths.slice(0, remainingCount) },
      localChatResponseSchemas.attachments,
    )
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.attachmentsRelease, (_event, input) => request(
    'attachments.release',
    localChatSchemas.attachmentRelease.parse(input),
    localChatResponseSchemas.releasedAttachments,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.attachmentsCleanupDrafts, (_event, input) => request(
    'attachments.cleanupDrafts',
    localChatSchemas.retainedAttachments.parse(input),
    localChatResponseSchemas.releasedAttachments,
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.usageSnapshot, () => request(
    'usage.snapshot',
    {},
    localChatResponseSchemas.usageSnapshot,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.chatStartTurn, (_event, input) => request(
    'chat.startTurn',
    localChatSchemas.startTurn.parse(input),
    localChatResponseSchemas.turnStart,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.chatEditUserMessage, (_event, input) => request(
    'chat.editUserMessage',
    localChatSchemas.editUserMessage.parse(input),
    localChatResponseSchemas.turnStart,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.chatExecuteCommand, (_event, input) => request(
    'chat.executeCommand',
    localChatSchemas.chatCommand.parse(input),
    localChatResponseSchemas.turnStart,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.chatRegenerateAssistant, (_event, input) => request(
    'chat.regenerateAssistant',
    localChatSchemas.regenerateAssistant.parse(input),
    localChatResponseSchemas.turnStart,
  ))
  handle(LOCAL_CHAT_IPC_CHANNELS.chatCancel, (_event, input) => request(
    'chat.cancel',
    localChatSchemas.runId.parse(input),
    localChatResponseSchemas.run,
  ))

  const stopStateSubscription = options.runtime.onStateChange((state) => {
    const parsed = localChatResponseSchemas.runtimeState.safeParse(state)
    if (parsed.success)
      sendToRenderer(options.getWindow(), LOCAL_CHAT_IPC_CHANNELS.runtimeStateChanged, parsed.data)
  })
  const stopDataOperationSubscription = options.runtimeRecovery.onDataOperationChange(
    (operation) => {
      const parsed = localChatResponseSchemas.runtimeDataOperation.safeParse(operation)
      if (parsed.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.runtimeDataOperationChanged,
          parsed.data,
        )
      }
    },
  )
  const stopNotificationSubscription = options.runtime.onNotification((notification) => {
    if (notification.method === 'run.event') {
      const event = localChatSchemas.runStateEvent.safeParse(notification.params)
      if (event.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.runEvent,
          toPublicRunEvent(event.data),
        )
      }
      return
    }
    if (notification.method === 'providers.authChallenge') {
      const challenge = localChatResponseSchemas.providerAuthChallenge.safeParse(notification.params)
      if (challenge.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.providerAuthChallenge,
          challenge.data,
        )
      }
    }
  })

  return () => {
    stopDataOperationSubscription()
    stopNotificationSubscription()
    stopStateSubscription()
    for (const channel of registeredChannels)
      ipcMain.removeHandler(channel)
  }
}

class DesktopRuntimeResponseError extends Error {
  readonly code = 'RUNTIME_PROTOCOL_ERROR'
}

function createLocalChatIpcError(error: unknown): Error {
  if (error instanceof ZodError) {
    return publicError('VALIDATION_FAILED', false)
  }
  const code = readStableErrorCode(error)
  if (code) {
    return publicError(code, new Set<LocalChatErrorCode>([
      'AUTHENTICATION_REQUIRED',
      'CONNECTOR_UNAVAILABLE',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_HAS_ACTIVE_RUNS',
      'RUNTIME_UNAVAILABLE',
    ]).has(code))
  }
  return publicError('LOCAL_CHAT_OPERATION_FAILED', false)
}

function readStableErrorCode(error: unknown): LocalChatErrorCode | null {
  if (!isRecord(error))
    return null
  const direct = typeof error.code === 'string' ? error.code : undefined
  if (isLocalChatErrorCode(direct))
    return direct
  const data = isRecord(error.data) ? error.data : null
  const nested = data && typeof data.code === 'string' ? data.code : undefined
  return isLocalChatErrorCode(nested) ? nested : null
}

function publicError(code: LocalChatErrorCode, retryable: boolean): Error {
  return new Error(formatLocalChatPublicError({ code, retryable }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function selectPaths(
  window: BrowserWindow | null,
  options: OpenDialogOptions,
): Promise<string[]> {
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

function sendToRenderer(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed())
    return
  window.webContents.send(channel, payload)
}
