import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createActivityApi(): Pick<LocalChatApi, 'artifacts' | 'notifications' | 'changes' | 'runs' | 'approvals' | 'usage'> {
  return {
    artifacts: Object.freeze({
      readText: artifactId => ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.artifactsReadText,
        { artifactId },
      ),
    }),
    notifications: Object.freeze({
      list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.notificationsList),
      markAllSeen: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.notificationsMarkAllSeen),
      markSeen: (notificationId, revision) => ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.notificationsMarkSeen,
        { notificationId, revision },
      ),
    }),
    changes: Object.freeze({
      overview: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.changesOverview, { ...input }),
      get: changeSetId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.changesGet, { changeSetId }),
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
      approveForTurn: approvalId =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.approvalsApproveForTurn, { approvalId }),
      deny: approvalId =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.approvalsDeny, { approvalId }),
    }),
    usage: Object.freeze({
      getSnapshot: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.usageSnapshot),
    }),
  }
}
