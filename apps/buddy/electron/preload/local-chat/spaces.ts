import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createSpacesApi(): Pick<LocalChatApi, 'spaces'> {
  return {
    spaces: Object.freeze({
      create: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesCreate, input),
      delete: spaceId => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesDelete, { spaceId }),
      list: limit => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesList, { limit }),
      searchFiles: (spaceId, query) =>
        ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesSearchFiles, { spaceId, query }),
      selectDirectory: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesSelectDirectory),
      update: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.spacesUpdate, input),
    }),
  }
}
