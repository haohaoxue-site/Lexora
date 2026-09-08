import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createConnectorsApi(): Pick<LocalChatApi, 'skills' | 'connectors'> {
  return {
    skills: Object.freeze({
      list: spaceId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.skillsList, { spaceId: spaceId ?? null }),
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
  }
}
