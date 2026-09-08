import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createWebApi(): Pick<LocalChatApi, 'web'> {
  return {
    web: Object.freeze({
      read: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.webSettingsRead),
      save: settings => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.webSettingsSave, settings),
      saveCredential: key => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.webCredentialSave, { key }),
      revealCredential: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.webCredentialReveal),
    }),
  }
}
