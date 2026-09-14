import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createConnectorsApi(): Pick<LocalChatApi, 'connectors'> {
  return {
    connectors: Object.freeze({
      setEnabled: (connectorId, enabled) => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsSetEnabled, { connectorId, enabled }),
      test: connectorId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsTest, { connectorId }),
      tools: connectorId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsTools, { connectorId }),
      login: connectorId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsLogin, { connectorId }),
      cancelLogin: connectorId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsCancelLogin, { connectorId }),
      list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsList),
      upsert: input =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsUpsert, input),
      remove: connectorId =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsRemove, { connectorId }),
      trust: (connectorId, trusted = true) =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsTrust, { connectorId, trusted }),
      setCredential: (connectorId, credential) =>
        ipcRenderer.invoke(
          LOCAL_CHAT_IPC_CHANNELS.connectorsSetCredential,
          { connectorId, credential },
        ),
      clearCredential: connectorId =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.connectorsClearCredential, { connectorId }),
    }),
  }
}
